import type { Coach } from '@kyonan/shared'
import { AppError } from '../api/errors'
import type { Runtime } from '../infrastructure/runtime'
import type { Db } from '../repositories/db'
import type { Actor } from './authorization'

/**
 * 検証環境（staging / mock）専用の「パスワード入場（閲覧者）」。
 *
 * - パスワードの照合と入場の可否は必ずバックエンドで行う（フロントエンドのコードは公開されるため）。
 * - 発行するのは短命の署名付きトークンのみ。読み取り専用の閲覧者としてのみ動作し、変更系 API は拒否する。
 * - APP_ENV が staging / mock 以外（本番）では、パスワードが設定されていても一切動作しない。
 */

export const GUEST_TOKEN_PREFIX = 'guest.'
export const GUEST_TOKEN_TTL_SECONDS = 4 * 60 * 60
export const GUEST_PASSWORD_MIN_LENGTH = 8
const ALLOWED_ENVS = ['staging', 'mock']
const MAX_FAILURES = 10
const FAILURE_WINDOW_SECONDS = 600
const FAILURE_KEY = 'guest:failures'
const GUEST_ID = 'guest-viewer'

/** 文字列を処理時間が内容に依存しない方法で比較する */
export function constantTimeEquals(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/** ゲスト入場が有効か（環境が staging / mock で、十分な長さのパスワードが設定されている） */
export function guestLoginEnabled(runtime: Runtime): boolean {
  const { appEnv, guestViewerPassword } = runtime.config
  return (
    ALLOWED_ENVS.includes(appEnv) &&
    typeof guestViewerPassword === 'string' &&
    guestViewerPassword.length >= GUEST_PASSWORD_MIN_LENGTH
  )
}

export const isGuestToken = (token: string) => token.startsWith(GUEST_TOKEN_PREFIX)

const signingKey = (runtime: Runtime) => `${runtime.config.guestViewerPassword}|guest-viewer-v1`
const sign = (runtime: Runtime, body: string) => runtime.hmacSha256Hex(signingKey(runtime), body)

const unauthenticated = (message = '認証に失敗しました') => new AppError('UNAUTHENTICATED', message)

/** パスワードを検証し、署名付きのゲストトークンを発行する。失敗が続くと一時的に受け付けない。 */
export function loginWithPassword(
  runtime: Runtime,
  password: string,
): { token: string; expiresAt: number } {
  if (!guestLoginEnabled(runtime)) {
    throw new AppError('FORBIDDEN', 'この環境ではパスワードでの入場は利用できません')
  }
  const failures = Number(runtime.cache.get(FAILURE_KEY) ?? '0')
  if (failures >= MAX_FAILURES) {
    throw new AppError(
      'RATE_LIMITED',
      '試行回数が多すぎます。しばらく待ってから再度お試しください。',
    )
  }
  if (!constantTimeEquals(password, runtime.config.guestViewerPassword ?? '')) {
    runtime.cache.put(FAILURE_KEY, String(failures + 1), FAILURE_WINDOW_SECONDS)
    throw unauthenticated('パスワードが正しくありません')
  }
  runtime.cache.remove(FAILURE_KEY)
  const expiresAtSec = Math.floor(runtime.now().getTime() / 1000) + GUEST_TOKEN_TTL_SECONDS
  const body = `${GUEST_TOKEN_PREFIX}${expiresAtSec}`
  return { token: `${body}.${sign(runtime, body)}`, expiresAt: expiresAtSec * 1000 }
}

/** ゲストトークンの署名・有効期限・環境を検証する。不正なら UNAUTHENTICATED。 */
export function verifyGuestToken(runtime: Runtime, token: string): void {
  if (!guestLoginEnabled(runtime)) throw unauthenticated()
  const parts = token.split('.')
  const [prefix, expiry, signature] = parts
  if (parts.length !== 3 || prefix !== 'guest' || !expiry || !signature || !/^\d+$/.test(expiry)) {
    throw unauthenticated()
  }
  const expected = sign(runtime, `${GUEST_TOKEN_PREFIX}${expiry}`)
  if (!constantTimeEquals(signature, expected)) throw unauthenticated()
  if (Number(expiry) * 1000 <= runtime.now().getTime()) {
    throw unauthenticated('ログインの有効期限が切れました')
  }
}

/** ゲストの仮想アクターを作る。実在のコーチではなく、シートには何も書き込まない。 */
export function guestActor(db: Db, now: Date): Actor {
  const iso = now.toISOString()
  const coach: Coach = {
    id: GUEST_ID,
    googleSub: null,
    email: `${GUEST_ID}@guest.invalid`,
    displayName: 'ゲスト（閲覧）',
    role: 'viewer',
    status: 'active',
    createdAt: iso,
    updatedAt: iso,
  }
  return {
    coach,
    groupIds: new Set(db.groups.filter((g) => g.status === 'active').map((g) => g.id)),
  }
}
