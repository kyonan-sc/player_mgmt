import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { ApiClientError, callApi } from '@/lib/api-client'
import { env } from '@/lib/env'
import { readTokenExpiry, useAuthStore, type SignOutReason } from '@/stores/auth-store'
import { useDraftStore } from '@/stores/draft-store'
import { disableGoogleAutoSelect } from './google-identity'

const MOCK_TOKEN_TTL_MS = 60 * 60 * 1000

/** ログイン・ログアウト処理。ログアウト時は認証情報と API キャッシュを破棄する（技術仕様 11章） */
export function useAuthActions() {
  const queryClient = useQueryClient()
  const { setToken, setMe, clear } = useAuthStore()

  const signOut = useCallback(
    (reason: SignOutReason = 'signed-out') => {
      queryClient.clear()
      if (!env.useMock) disableGoogleAutoSelect()
      // 明示的なログアウト時は未保存入力の退避も破棄する（期限切れ時は再ログイン後に復元する）
      if (reason !== 'expired') useDraftStore.getState().clearAll()
      clear(reason)
    },
    [clear, queryClient],
  )

  /** ID Token を受け取り、バックエンドで検証・コーチ照合を行う */
  const signIn = useCallback(
    async (idToken: string) => {
      const expiresAt = env.useMock ? Date.now() + MOCK_TOKEN_TTL_MS : readTokenExpiry(idToken)
      if (!expiresAt || expiresAt <= Date.now())
        throw new ApiClientError('UNAUTHENTICATED', 'ログイン情報が無効です')
      try {
        const me = await callApi('auth.me', {}, { idToken })
        queryClient.clear()
        setToken(idToken, expiresAt)
        setMe(me)
        return me
      } catch (error) {
        if (error instanceof ApiClientError && error.code === 'FORBIDDEN') clear('not-registered')
        throw error
      }
    },
    [clear, queryClient, setMe, setToken],
  )

  return { signIn, signOut }
}

/** ID Token の有効期限で自動的にログアウトし、再認証を要求する */
export function useSessionExpiry() {
  const expiresAt = useAuthStore((s) => s.expiresAt)
  const { signOut } = useAuthActions()
  useEffect(() => {
    if (!expiresAt) return
    const ms = expiresAt - Date.now()
    if (ms <= 0) {
      signOut('expired')
      return
    }
    const timer = window.setTimeout(() => signOut('expired'), Math.min(ms, 2 ** 31 - 1))
    return () => window.clearTimeout(timer)
  }, [expiresAt, signOut])
}
