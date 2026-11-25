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
  it('初期状態は全項目が未選択で、提出できない', async () => {
    signInAs(COACH)
    renderInput('/assessments/cycle-7/players/player-20')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    const radios = await screen.findAllByRole('radio')
    // 5段階の10項目（シュートを含む）×5 + 練習への取り組み4項目×3段階
    expect(radios).toHaveLength(62)
    expect(radios.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(screen.queryByRole('radio', { name: /^未観察/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^提出$/ })).toBeDisabled()
    expect(screen.getByText('あと14項目で表示')).toBeInTheDocument()
  })

  it('全14項目を入力すると総合得点が表示され、提出するとバックエンドに保存される', async () => {
    const user = userEvent.setup()
    signInAs(COACH)
    renderInput('/assessments/cycle-7/players/player-20')
    const groups = await screen.findAllByRole('radiogroup')
    expect(groups).toHaveLength(14)
    // 取り組み（3段階）を除く10項目だけでは提出できない
    for (const group of groups.slice(0, 10)) {
      await user.click(within(group).getByRole('radio', { name: /^3点/ }))
    }
    expect(screen.getByRole('button', { name: /^提出$/ })).toBeDisabled()
    expect(screen.getByText('あと4項目で表示')).toBeInTheDocument()

    for (const group of groups.slice(10)) {
      await user.click(within(group).getByRole('radio', { name: /^3点/ }))
    }
    // 基本4カテゴリ3/5 = 60%（配点90）＋ 練習への取り組み3/3 = 100%（配点10）
    expect(screen.getByText('64.0')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^提出$/ }))

    expect(await screen.findByText('評価を提出しました')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('提出済み')).toBeInTheDocument())
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
