import { AlertCircle, ArrowRight, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { MockBanner } from '@/components/layout/AppShell'
import { BrandMark } from '@/components/layout/BrandMark'
import { Button } from '@/components/ui/button'
import { callApi, errorMessage } from '@/lib/api-client'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils'
import { MOCK_GUEST_PASSWORD, MOCK_USERS } from '@/mocks/mock-users'
import { useAuthStore } from '@/stores/auth-store'
import { GuestPasswordLogin } from './GuestPasswordLogin'
import { guestLoginAvailable } from './guest-login'
import { loadGoogleIdentity } from './google-identity'
import { useAuthActions } from './use-auth'

const REASON_MESSAGE = {
  expired: 'ログインの有効期限が切れました。もう一度ログインしてください。',
  'not-registered':
    'このGoogleアカウントにはアクセス権がありません。チーム管理者に登録を依頼してください。',
  'signed-out': null,
} as const

function GoogleSignInButton({
  onCredential,
  disabled,
}: {
  onCredential: (token: string) => void
  disabled: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const callback = useRef(onCredential)
  useEffect(() => {
    callback.current = onCredential
  })

  useEffect(() => {
    if (!env.googleClientId) return
    let cancelled = false
    loadGoogleIdentity()
      .then((gis) => {
        if (cancelled || !ref.current) return
        gis.initialize({
          client_id: env.googleClientId,
          callback: (res) => callback.current(res.credential),
          auto_select: false,
          cancel_on_tap_outside: true,
          ux_mode: 'popup',
          use_fedcm_for_prompt: true,
          itp_support: true,
        })
        gis.renderButton(ref.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: Math.min(320, ref.current.clientWidth || 320),
          locale: 'ja',
        })
      })
      .catch((e: Error) => setLoadError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  const error = env.googleClientId
    ? loadError
    : 'Google OAuth クライアント ID が設定されていません（VITE_GOOGLE_CLIENT_ID）'
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-destructive/8 p-3 text-sm text-destructive">
        {error}
      </p>
    )
  }
  return (
    <div
      ref={ref}
      className={cn(
        'flex min-h-11 w-full justify-center',
        disabled && 'pointer-events-none opacity-50',
      )}
    />
  )
}

function MockSignIn({
  onSelect,
  pending,
}: {
  onSelect: (email: string) => void
  pending: string | null
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">モックユーザーを選択してログイン</p>
      <ul className="space-y-2">
        {MOCK_USERS.map((u) => (
          <li key={u.email}>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => onSelect(u.email)}
              className="flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card px-3.5 py-2.5 text-left transition-colors hover:border-brand-accent/50 hover:bg-accent disabled:opacity-60"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {u.name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{u.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {u.description}
                </span>
              </span>
              {pending === u.email ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowRight className="size-4 text-muted-foreground" />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LoginPage() {
  const me = useAuthStore((s) => s.me)
  const reason = useAuthStore((s) => s.signOutReason)
  const { signIn } = useAuthActions()
  const navigate = useNavigate()
  const location = useLocation()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  // アカウントを選ぶ間にバックエンドを起こしておき、ログイン直後の待ち時間を短くする
  useEffect(() => {
    if (!env.useMock) void callApi('health.check', {}).catch(() => {})
  }, [])

  if (me) return <Navigate to={from} replace />

  const handleToken = async (token: string, key: string) => {
    setPending(key)
    setError(null)
    try {
      await signIn(token)
      void navigate(from, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(null)
    }
  }

  const handleGuest = async (password: string) => {
    setPending('guest')
    setError(null)
    try {
      const session = await callApi('auth.guestLogin', { password })
      await signIn(session.token, { expiresAt: session.expiresAt })
      void navigate(from, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setPending(null)
    }
  }

  const notice = error ?? (reason ? REASON_MESSAGE[reason] : null)

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <MockBanner />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <BrandMark className="size-14 rounded-2xl text-sm" />
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">境南SC 選手評価管理</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              共通の評価基準で選手の成長を記録し、
              <br className="hidden sm:inline" />
              指導とチーム編成の判断を支援します。
            </p>
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-card sm:p-6">
            {notice && (
              <div
                role="alert"
                className="mb-4 flex gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{notice}</span>
              </div>
            )}
            {env.useMock ? (
              <MockSignIn
                pending={pending}
                onSelect={(email) => void handleToken(`mock:${email}`, email)}
              />
            ) : (
              <div className="space-y-3">
                <GoogleSignInButton
                  disabled={pending !== null}
                  onCredential={(t) => void handleToken(t, 'google')}
                />
                {pending && (
                  <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> 認証しています…
                  </p>
                )}
              </div>
            )}
            {guestLoginAvailable && (
              <div className="mt-5 border-t pt-4">
                <GuestPasswordLogin
                  pending={pending === 'guest'}
                  onSubmit={(p) => void handleGuest(p)}
                />
                {env.useMock && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    モックのパスワード：
                    <code className="rounded bg-muted px-1">{MOCK_GUEST_PASSWORD}</code>
                  </p>
                )}
              </div>
            )}
            <div className="mt-5 flex items-start gap-2 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-accent" />
              <span>
                事前に登録されたコーチのみ利用できます。選手の個人情報を扱うため、共用端末ではログアウトしてください。
              </span>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Button variant="link" size="sm" asChild className="text-muted-foreground">
              <Link to="/dev/connectivity">接続診断</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
