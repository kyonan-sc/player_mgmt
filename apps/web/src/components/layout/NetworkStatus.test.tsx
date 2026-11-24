import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callApi } from '@/lib/api-client'
import { useNetworkActivity } from '@/lib/network-activity'
import { NetworkStatus } from './NetworkStatus'

const progress = () => screen.getByTestId('network-progress')

beforeEach(() => {
  vi.useFakeTimers()
  useNetworkActivity.setState({ pending: {}, oldest: null })
})
afterEach(() => vi.useRealTimers())

describe('NetworkStatus（バックエンド待ちの表示）', () => {
  it('通信がなければ何も表示しない', () => {
    render(<NetworkStatus />)
    expect(progress()).toHaveClass('opacity-0')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('ごく短い通信では表示せず、0.25 秒を超えたら進行バーを出す', () => {
    render(<NetworkStatus />)
    let id = 0
    act(() => {
      id = useNetworkActivity.getState().begin()
    })
    act(() => void vi.advanceTimersByTime(100))
    expect(progress()).toHaveClass('opacity-0')
    act(() => void vi.advanceTimersByTime(300))
    expect(progress()).toHaveClass('opacity-100')
    act(() => useNetworkActivity.getState().end(id))
    expect(progress()).toHaveClass('opacity-0')
  })

  it('3 秒で経過秒数つきのメッセージ、8 秒で起動待ちの案内に切り替わり、完了すると消える', () => {
    render(<NetworkStatus />)
    let id = 0
    act(() => {
      id = useNetworkActivity.getState().begin()
    })
    act(() => void vi.advanceTimersByTime(3500))
    expect(screen.getByRole('status')).toHaveTextContent('サーバーの応答を待っています')
    expect(screen.getByRole('status')).toHaveTextContent('3秒')

    act(() => void vi.advanceTimersByTime(5000))
    expect(screen.getByRole('status')).toHaveTextContent('時間がかかっています')
    expect(screen.getByRole('status')).toHaveTextContent('数十秒かかることがあります')

    act(() => useNetworkActivity.getState().end(id))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('短い通信が連続しても、1 件が遅くなければ「待っています」を出さない', () => {
    render(<NetworkStatus />)
    for (let i = 0; i < 6; i++) {
      let id = 0
      act(() => {
        id = useNetworkActivity.getState().begin()
      })
      act(() => void vi.advanceTimersByTime(800))
      act(() => useNetworkActivity.getState().end(id))
    }
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('callApi の通信状況の記録', () => {
  it('成功・失敗のどちらでも、完了したら実行中の記録を解除する', async () => {
    vi.useRealTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ success: true, data: { status: 'ok' }, requestId: 'r' }),
      })
      .mockRejectedValueOnce(new TypeError('network down'))
    vi.stubGlobal('fetch', fetchMock)

    const first = callApi('health.check', {})
    expect(useNetworkActivity.getState().oldest).not.toBeNull()
    await first
    expect(useNetworkActivity.getState().oldest).toBeNull()

    await expect(callApi('health.check', {})).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(useNetworkActivity.getState().oldest).toBeNull()
    vi.unstubAllGlobals()
  })
})
