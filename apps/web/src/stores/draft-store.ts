import type { ItemScores } from '@kyonan/shared'
import { create } from 'zustand'

export interface DraftValues {
  scores: ItemScores
  strengths: string
  improvementPoints: string
  comment: string
}

interface DraftState {
  /**
   * 未保存の評価入力の退避先。ログイン期限切れで再認証が必要になった場合に入力を失わないためのもの。
   * メモリ内のみで保持し、永続ストレージには保存しない（技術仕様 11章）。
   */
  drafts: Record<string, DraftValues>
  stash: (key: string, values: DraftValues) => void
  discard: (key: string) => void
  clearAll: () => void
}

export const draftKey = (cycleId: string, playerId: string) => `${cycleId}:${playerId}`

export const useDraftStore = create<DraftState>()((set) => ({
  drafts: {},
  stash: (key, values) => set((s) => ({ drafts: { ...s.drafts, [key]: values } })),
  discard: (key) =>
    set((s) => {
      const next = { ...s.drafts }
      delete next[key]
      return { drafts: next }
    }),
  clearAll: () => set({ drafts: {} }),
}))
