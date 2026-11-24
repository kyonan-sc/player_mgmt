import { ArrowLeft, CheckCircle2, CircleDashed, Loader2, Play, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { BrandMark } from '@/components/layout/BrandMark'
import { MockBanner } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { callApi, errorMessage } from '@/lib/api-client'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import { loadGoogleIdentity } from '@/features/auth/google-identity'

type Status = 'idle' | 'running' | 'ok' | 'ng'
interface StepResult {
  status: Status
  detail?: string
  ms?: number
}

const STEPS = [
  {
    id: 'health',
    title: '1. CORS・リダイレクト（health.check）',
    desc: '認証なしの POST が GAS まで到達し、レスポンスを読み取れること',
  },
  {
    id: 'login',
    title: '2. Google ログイン（GIS）',
    desc: 'ID Token を取得できること（ポップアップ / FedCM）',
  },
  {
    id: 'verify',
    title: '3. ID Token 検証・Sheets 読み取り（auth.me）',
    desc: 'GAS で署名・クレームを検証し、コーチマスタと照合できること',
  },
  {
    id: 'write',
    title: '4. Sheets 書き込み（settings.update・管理者のみ）',
    desc: '現在の設定値を再保存し、LockService 経由の書き込みが成功すること',
  },
] as const
type StepId = (typeof STEPS)[number]['id']

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now()
  const value = await fn()
  return { value, ms: Math.round(performance.now() - start) }
}

/**
 * Phase 0 技術検証用の接続診断（P0-03）。Chrome / Safari / iOS Safari で実行し、結果を実装計画書に記録する。
 * ID Token は画面に表示・保存しない。
 */
export function ConnectivityPage() {
  const [results, setResults] = useState<Partial<Record<StepId, StepResult>>>({})
  const [token, setToken] = useState<string | null>(null)
  const buttonRef = useRef<HTMLDivElement>(null)
  const set = (id: StepId, r: StepResult) => setResults((prev) => ({ ...prev, [id]: r }))
  const sessionToken = useAuthStore((s) => s.idToken)

  useEffect(() => {
    if (env.useMock || !env.googleClientId) return
    loadGoogleIdentity()
      .then((gis) => {
        gis.initialize({
          client_id: env.googleClientId,
          ux_mode: 'popup',
          use_fedcm_for_prompt: true,
          callback: (res) => {
            setToken(res.credential)
            set('login', {
              status: 'ok',
              detail: `ID Token を取得しました（${res.credential.length}文字）`,
            })
          },
        })
        if (buttonRef.current)
          gis.renderButton(buttonRef.current, {
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            locale: 'ja',
          })
      })
      .catch((e: Error) => set('login', { status: 'ng', detail: e.message }))
  }, [])

  const runHealth = async () => {
    set('health', { status: 'running' })
    try {
      const { value, ms } = await timed(() => callApi('health.check', {}))
      set('health', {
        status: 'ok',
        ms,
        detail: `env=${value.env} / schema v${value.schemaVersion} / ${value.serverTime}`,
      })
    } catch (e) {
      set('health', { status: 'ng', detail: errorMessage(e) })
    }
  }

  const idToken = env.useMock
    ? (sessionToken ?? 'mock:kantoku@kyonan-sc.example')
    : (token ?? sessionToken)

  const runVerify = async () => {
    set('verify', { status: 'running' })
    try {
      const { value, ms } = await timed(() => callApi('auth.me', {}, { idToken }))
      set('verify', {
        status: 'ok',
        ms,
        detail: `${value.displayName}（${value.role}）として認証されました`,
      })
    } catch (e) {
      set('verify', { status: 'ng', detail: errorMessage(e) })
    }
  }

  const runWrite = async () => {
    set('write', { status: 'running' })
    try {
      const current = await callApi('settings.get', {}, { idToken })
      const { ms } = await timed(() => callApi('settings.update', current, { idToken }))
      set('write', { status: 'ok', ms, detail: '書き込みに成功しました（操作履歴に記録されます）' })
    } catch (e) {
      set('write', { status: 'ng', detail: errorMessage(e) })
    }
  }

  const actions: Record<StepId, (() => Promise<void>) | null> = {
    health: runHealth,
    login: null,
    verify: idToken ? runVerify : null,
    write: idToken ? runWrite : null,
  }

  return (
    <div className="min-h-dvh bg-background">
      <MockBanner />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/login">
            <ArrowLeft /> 戻る
          </Link>
        </Button>
        <div className="mb-6 flex items-center gap-3">
          <BrandMark className="size-10" />
          <div>
            <h1 className="text-xl font-semibold">接続診断</h1>
            <p className="text-sm text-muted-foreground">
              GitHub Pages と GAS 間の通信・認証の技術検証
            </p>
          </div>
        </div>

        <dl className="mb-6 grid grid-cols-[9rem_1fr] gap-y-1.5 rounded-xl border bg-card p-4 text-sm shadow-card">
          <dt className="text-muted-foreground">環境</dt>
          <dd>
            {env.appEnv}
            {env.useMock && '（モック）'}
          </dd>
          <dt className="text-muted-foreground">API URL</dt>
          <dd className="truncate font-mono text-xs leading-5">{env.apiUrl || '（未設定）'}</dd>
          <dt className="text-muted-foreground">Client ID</dt>
          <dd className="truncate font-mono text-xs leading-5">
            {env.googleClientId || '（未設定）'}
          </dd>
          <dt className="text-muted-foreground">ブラウザ</dt>
          <dd className="text-xs leading-5 break-all text-muted-foreground">
            {navigator.userAgent}
          </dd>
        </dl>

        <ol className="space-y-3">
          {STEPS.map((step) => {
            const r =
              results[step.id] ??
              (step.id === 'login' && !env.useMock && !env.googleClientId
                ? { status: 'ng' as Status, detail: 'VITE_GOOGLE_CLIENT_ID が未設定です' }
                : { status: 'idle' as Status })
            const action = actions[step.id]
            return (
              <li key={step.id} className="rounded-xl border bg-card p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5">
                    {r.status === 'ok' && <CheckCircle2 className="size-5 text-success" />}
                    {r.status === 'ng' && <XCircle className="size-5 text-destructive" />}
                    {r.status === 'running' && (
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    )}
                    {r.status === 'idle' && (
                      <CircleDashed className="size-5 text-muted-foreground" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{step.title}</p>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                    {r.detail && (
                      <p
                        className={cn(
                          'mt-2 text-sm break-all',
                          r.status === 'ng' ? 'text-destructive' : 'text-foreground',
                        )}
                      >
                        {r.detail}
                        {r.ms !== undefined && (
                          <span className="num ml-2 text-xs text-muted-foreground">{r.ms}ms</span>
                        )}
                      </p>
                    )}
                    {step.id === 'login' && !env.useMock && (
                      <div ref={buttonRef} className="mt-3" />
                    )}
                    {step.id === 'login' && env.useMock && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        モックモードでは mock トークンを使用します。
                      </p>
                    )}
                  </div>
                  {action && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={r.status === 'running'}
                      onClick={() => void action()}
                    >
                      <Play /> 実行
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
