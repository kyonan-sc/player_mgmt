import { KEYUTIL, KJUR, b64utoutf8 } from 'jsrsasign'
import { AppError } from '../api/errors'
import type { Runtime } from '../infrastructure/runtime'
import type { IdTokenVerifier, VerifiedClaims } from './verifier'

export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com']
const CERTS_CACHE_KEY = 'auth:google-certs'
const CERTS_REFRESH_GUARD_KEY = 'auth:google-certs-refreshed'
/** CacheService の上限（6時間） */
const MAX_CACHE_SECONDS = 21600
const DEFAULT_CACHE_SECONDS = 3600
const CLOCK_SKEW_SECONDS = 60

interface Jwk {
  kid: string
  kty: string
  alg?: string
  n: string
  e: string
}

const unauthenticated = (reason: string) =>
  new AppError('UNAUTHENTICATED', `認証に失敗しました（${reason}）`)

function decodeSegment(segment: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(b64utoutf8(segment))
  if (!parsed || typeof parsed !== 'object') throw new Error('not an object')
  return parsed as Record<string, unknown>
}

/**
 * Google ID Token を検証する。暗号処理は jsrsasign（純粋 JS 実装）に委譲する。
 * GAS には RSA 署名検証 API が無いため、WebCrypto 依存のライブラリは使用できない（T-03）。
 */
export class GoogleIdTokenVerifier implements IdTokenVerifier {
  constructor(
    private readonly runtime: Runtime,
    private readonly clientId: string,
  ) {
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not configured')
  }

  verify(idToken: string): VerifiedClaims {
    const parts = idToken.split('.')
    if (parts.length !== 3) throw unauthenticated('形式不正')
    let header: Record<string, unknown>
    let payload: Record<string, unknown>
    try {
      header = decodeSegment(parts[0]!)
      payload = decodeSegment(parts[1]!)
    } catch {
      throw unauthenticated('形式不正')
    }

    if (header.alg !== 'RS256') throw unauthenticated('署名アルゴリズム不正')
    if (typeof header.kid !== 'string' || header.kid === '') throw unauthenticated('鍵ID不正')

    const jwk = this.findKey(header.kid)
    if (!jwk) throw unauthenticated('不明な鍵')

    let valid: boolean
    try {
      const key = KEYUTIL.getKey({ kty: 'RSA', n: jwk.n, e: jwk.e } as never)
      valid = KJUR.jws.JWS.verify(idToken, key as never, ['RS256'])
    } catch {
      valid = false
    }
    if (!valid) throw unauthenticated('署名不正')

    const nowSec = Math.floor(this.runtime.now().getTime() / 1000)
    if (typeof payload.iss !== 'string' || !GOOGLE_ISSUERS.includes(payload.iss)) {
      throw unauthenticated('発行者不正')
    }
    const aud = payload.aud
    const audOk = Array.isArray(aud) ? aud.includes(this.clientId) : aud === this.clientId
    if (!audOk) throw unauthenticated('対象者不正')
    if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < nowSec) {
      throw unauthenticated('有効期限切れ')
    }
    if (typeof payload.iat === 'number' && payload.iat - CLOCK_SKEW_SECONDS > nowSec) {
      throw unauthenticated('発行日時不正')
    }
    if (typeof payload.sub !== 'string' || payload.sub === '') throw unauthenticated('識別子不正')
    if (typeof payload.email !== 'string' || payload.email === '')
      throw unauthenticated('メール不正')
    if (payload.email_verified !== true && payload.email_verified !== 'true') {
      throw unauthenticated('メール未検証')
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: true,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    }
  }

  private findKey(kid: string): Jwk | undefined {
    const cached = this.readCachedKeys()
    const hit = cached?.find((k) => k.kid === kid)
    if (hit) return hit
    if (cached) {
      // 未知の kid は鍵ローテーションの可能性があるため再取得する。乱発を防ぐため60秒に1回まで。
      if (this.runtime.cache.get(CERTS_REFRESH_GUARD_KEY)) return undefined
      this.runtime.cache.put(CERTS_REFRESH_GUARD_KEY, '1', 60)
    }
    return this.fetchKeys().find((k) => k.kid === kid)
  }

  private readCachedKeys(): Jwk[] | null {
    const raw = this.runtime.cache.get(CERTS_CACHE_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as Jwk[]
    } catch {
      return null
    }
  }

  private fetchKeys(): Jwk[] {
    const res = this.runtime.fetchText(GOOGLE_CERTS_URL)
    if (res.status !== 200) throw new AppError('INTERNAL_ERROR', '認証用公開鍵の取得に失敗しました')
    const body = JSON.parse(res.body) as { keys?: Jwk[] }
    const keys = (body.keys ?? []).filter((k) => k.kty === 'RSA' && typeof k.kid === 'string')
    const ttl = parseMaxAge(res.headers)
    this.runtime.cache.put(CERTS_CACHE_KEY, JSON.stringify(keys), ttl)
    return keys
  }
}

function parseMaxAge(headers: Record<string, string>): number {
  const entry = Object.entries(headers).find(([k]) => k.toLowerCase() === 'cache-control')
  const match = entry?.[1].match(/max-age=(\d+)/)
  const seconds = match ? Number(match[1]) : DEFAULT_CACHE_SECONDS
  return Math.max(60, Math.min(MAX_CACHE_SECONDS, seconds))
}
