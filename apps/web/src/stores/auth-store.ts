import type { Me } from '@kyonan/shared'
import { create } from 'zustand'

export type SignOutReason = 'expired' | 'signed-out' | 'not-registered' | null

interface AuthState {
  /** ID Token はメモリ内にのみ保持し、永続ストレージには保存しない（技術仕様 7.3） */
  idToken: string | null
  expiresAt: number | null
  me: Me | null
  signOutReason: SignOutReason
  setToken: (idToken: string, expiresAt: number) => void
  setMe: (me: Me) => void
  clear: (reason: SignOutReason) => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  idToken: null,
  expiresAt: null,
  me: null,
  signOutReason: null,
  setToken: (idToken, expiresAt) => set({ idToken, expiresAt, signOutReason: null }),
  setMe: (me) => set({ me }),
  clear: (signOutReason) => set({ idToken: null, expiresAt: null, me: null, signOutReason }),
}))

/** JWT の exp を読み取る（表示・失効タイマー用。署名検証はバックエンドで行う） */
export function readTokenExpiry(idToken: string): number | null {
  try {
    const payload = idToken.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: unknown
    }
    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}
