import { create } from 'zustand'

interface NetworkActivityState {
  /** 実行中のリクエスト（ID → 開始時刻 ms） */
  pending: Record<number, number>
  /** 実行中のうち最も古いリクエストの開始時刻。実行中がなければ null */
  oldest: number | null
  begin: () => number
  end: (id: number) => void
}

let nextId = 1

const oldestOf = (pending: Record<number, number>): number | null => {
  const starts = Object.values(pending)
  return starts.length === 0 ? null : Math.min(...starts)
}

/**
 * バックエンド（GAS）へのリクエストの実行状況。api-client が出入りで更新し、
 * 画面全体の待機表示（NetworkStatus）が購読する。
 */
export const useNetworkActivity = create<NetworkActivityState>()((set) => ({
  pending: {},
  oldest: null,
  begin: () => {
    const id = nextId++
    set((s) => {
      const pending = { ...s.pending, [id]: Date.now() }
      return { pending, oldest: oldestOf(pending) }
    })
    return id
  },
  end: (id) =>
    set((s) => {
      if (!(id in s.pending)) return s
      const pending = { ...s.pending }
      delete pending[id]
      return { pending, oldest: oldestOf(pending) }
    }),
}))
