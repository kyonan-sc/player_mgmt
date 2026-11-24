import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createQueryClient } from '@/lib/query'
import { createMockHandlers } from '@/mocks/handlers'
import { MOCK_GUEST_PASSWORD } from '@/mocks/mock-users'
import { useAuthStore } from '@/stores/auth-store'
import { LoginPage } from './LoginPage'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

beforeEach(() => {
  server.use(...createMockHandlers())
  useAuthStore.setState({ idToken: null, expiresAt: null, me: null, signOutReason: null })
})

function renderLogin() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <p>ダッシュボード画面</p> },
    ],
    { initialEntries: ['/login'] },
  )
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('パスワード入場（検証環境のみ）', () => {
  it('正しいパスワードで、ログインせずに閲覧者として入れる', async () => {
    const user = userEvent.setup()
    const router = renderLogin()
    await user.type(screen.getByPlaceholderText('パスワード'), MOCK_GUEST_PASSWORD)
    await user.click(screen.getByRole('button', { name: '入る' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    const { me, idToken, expiresAt } = useAuthStore.getState()
    expect(me).toMatchObject({ role: 'viewer', displayName: 'ゲスト（閲覧）' })
    expect(idToken).toMatch(/^guest\./)
    expect(expiresAt).toBeGreaterThan(Date.now())
  })

  it('誤ったパスワードでは入れず、エラーを表示する', async () => {
    const user = userEvent.setup()
    const router = renderLogin()
    await user.type(screen.getByPlaceholderText('パスワード'), 'まちがい-password')
    await user.click(screen.getByRole('button', { name: '入る' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('パスワードが正しくありません')
    expect(router.state.location.pathname).toBe('/login')
    expect(useAuthStore.getState().me).toBeNull()
  })

  it('パスワードが空のあいだは送信できない', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: '入る' })).toBeDisabled()
  })
})
