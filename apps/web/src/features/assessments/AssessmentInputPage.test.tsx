import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Toaster } from '@/components/ui/sonner'
import { RequireRole } from '@/features/auth/guards'
import { createQueryClient } from '@/lib/query'
import { createMockHandlers } from '@/mocks/handlers'
import { useAuthStore } from '@/stores/auth-store'
import { useDraftStore } from '@/stores/draft-store'
import { AssessmentInputPage } from './AssessmentInputPage'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const COACH = { email: 'tanaka@kyonan-sc.example', id: 'coach-2', role: 'coach' as const }
const VIEWER = { email: 'viewer@kyonan-sc.example', id: 'coach-4', role: 'viewer' as const }

function signInAs(user: typeof COACH | typeof VIEWER) {
  useAuthStore.setState({
    idToken: `mock:${user.email}`,
    expiresAt: Date.now() + 3_600_000,
    me: {
      id: user.id,
      email: user.email,
      displayName: user.email,
      role: user.role,
      groupIds: ['group-2018'],
    },
    signOutReason: null,
  })
}

function renderInput(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/assessments/:cycleId/players/:playerId',
        element: (
          <RequireRole roles={['admin', 'coach']}>
            <AssessmentInputPage />
          </RequireRole>
        ),
      },
      { path: '/assessments/:cycleId', element: <p>評価期間詳細</p> },
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  )
  return router
}

beforeEach(() => {
  // テストごとに初期状態のモックデータで開始する
  server.use(...createMockHandlers({ now: () => new Date('2026-11-24T03:00:00Z') }))
  useDraftStore.getState().clearAll()
})

describe('評価入力画面（SCR-08）', () => {
  it('初期状態は必須項目が未選択で、提出できない', async () => {
    signInAs(COACH)
    renderInput('/assessments/cycle-7/players/player-20')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    const radios = await screen.findAllByRole('radio')
    // 5段階の9項目×5 + 練習への取り組み4項目×（3段階＋未観察）
    expect(radios).toHaveLength(61)
    const scored = radios.filter((r) => !/^未観察/.test(r.getAttribute('aria-label') ?? ''))
    expect(scored.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(screen.getByRole('button', { name: /^提出$/ })).toBeDisabled()
    expect(screen.getByText('あと9項目で表示')).toBeInTheDocument()
  })

  it('必須の9項目を入力すると総合得点が表示され、未観察のまま提出するとバックエンドに保存される', async () => {
    const user = userEvent.setup()
    signInAs(COACH)
    renderInput('/assessments/cycle-7/players/player-20')
    const groups = await screen.findAllByRole('radiogroup')
    for (const group of groups) {
      if (within(group).queryByRole('radio', { name: /^未観察/ })) continue
      await user.click(within(group).getByRole('radio', { name: /^3点/ }))
    }

    // 練習への取り組みが全て未観察なら、観察できたカテゴリだけで100点換算する
    expect(screen.getByText('60.0')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^提出$/ }))

    expect(await screen.findByText('評価を提出しました')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('提出済み')).toBeInTheDocument())
  })

  it('練習への取り組みは3段階で入力でき、点数が総合得点に反映される', async () => {
    const user = userEvent.setup()
    signInAs(COACH)
    renderInput('/assessments/cycle-7/players/player-20')
    const groups = await screen.findAllByRole('radiogroup')
    for (const group of groups) await user.click(within(group).getByRole('radio', { name: /^3点/ }))
    // 4カテゴリ60%（配点90）＋練習への取り組み100%（配点10）
    expect(screen.getByText('64.0')).toBeInTheDocument()
  })
  it('一部のみ入力した場合は下書き保存でき、未入力のまま次へ進める', async () => {
    const user = userEvent.setup()
    signInAs(COACH)
    const router = renderInput('/assessments/cycle-7/players/player-20')
    const [first] = await screen.findAllByRole('radiogroup')
    await user.click(within(first!).getByRole('radio', { name: /^4点/ }))
    await user.click(screen.getByRole('button', { name: /保存して次へ/ }))
    expect(await screen.findByText('下書きを保存しました')).toBeInTheDocument()
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/assessments/cycle-7/players/player-21'),
    )
  })

  it('閲覧者（viewer）は評価入力画面を表示できない', async () => {
    signInAs(VIEWER)
    renderInput('/assessments/cycle-7/players/player-20')
    expect(await screen.findByText('この画面を表示する権限がありません')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
})
