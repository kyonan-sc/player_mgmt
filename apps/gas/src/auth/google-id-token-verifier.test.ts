import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createMemoryRuntime } from '../core'
import type { Runtime } from '../infrastructure/runtime'
import { GoogleIdTokenVerifier } from './google-id-token-verifier'

const CLIENT_ID = 'client-123.apps.googleusercontent.com'
const NOW = Date.parse('2026-06-01T00:00:00Z')
const nowSec = Math.floor(NOW / 1000)

function keypair(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' } }
}
const key1 = keypair('k1')
const key2 = keypair('k2')

const b64u = (v: unknown) =>
  Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')
function token(
  payload: Record<string, unknown>,
  opts: { kid?: string; alg?: string; key?: KeyObject } = {},
) {
  const header = { alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' }
  const input = `${b64u(header)}.${b64u(payload)}`
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), opts.key ?? key1.privateKey).toString('base64url')}`
}
const claims = {
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '10001',
  email: 'Coach@Example.com',
  email_verified: true,
  iat: nowSec - 60,
  exp: nowSec + 3600,
}

function setup(jwks: { keys: unknown[] }[] = [{ keys: [key1.jwk] }]) {
  let fetches = 0
  const base = createMemoryRuntime({ now: () => new Date(NOW) })
  const runtime: Runtime = {
    ...base,
    fetchText: () => {
      const body = jwks[Math.min(fetches, jwks.length - 1)]
      fetches++
      return {
        status: 200,
        body: JSON.stringify(body),
        headers: { 'cache-control': 'public, max-age=20000' },
      }
    },
  }
  return { verifier: new GoogleIdTokenVerifier(runtime, CLIENT_ID), fetchCount: () => fetches }
}

const rejects = (fn: () => unknown) =>
  expect(fn).toThrowError(expect.objectContaining({ code: 'UNAUTHENTICATED' }))

describe('GoogleIdTokenVerifier', () => {
  it('正しいトークンを受理し、メールアドレスを小文字に正規化する', () => {
    const { verifier } = setup()
    expect(verifier.verify(token(claims))).toEqual({
      sub: '10001',
      email: 'coach@example.com',
      emailVerified: true,
      name: undefined,
    })
  })

  it('公開鍵をキャッシュし、2回目以降は取得しない', () => {
    const { verifier, fetchCount } = setup()
    verifier.verify(token(claims))
    verifier.verify(token(claims))
    expect(fetchCount()).toBe(1)
  })

  it('未知の kid を受信したら公開鍵を再取得する（鍵ローテーション）', () => {
    const { verifier, fetchCount } = setup([{ keys: [key1.jwk] }, { keys: [key1.jwk, key2.jwk] }])
    verifier.verify(token(claims))
    expect(verifier.verify(token(claims, { kid: 'k2', key: key2.privateKey })).sub).toBe('10001')
    expect(fetchCount()).toBe(2)
  })

  it.each([
    ['署名不正（別の鍵で署名）', () => token(claims, { key: key2.privateKey })],
    ['alg が RS256 以外', () => token(claims, { alg: 'HS256' })],
    ['issuer 不正', () => token({ ...claims, iss: 'https://evil.example.com' })],
    ['audience 不一致', () => token({ ...claims, aud: 'other-client' })],
    ['有効期限切れ', () => token({ ...claims, exp: nowSec - 120 })],
    ['email 未検証', () => token({ ...claims, email_verified: false })],
    ['sub なし', () => token({ ...claims, sub: '' })],
    ['形式不正', () => 'not-a-jwt'],
    [
      'ペイロード改ざん',
      () => {
        const [h, , s] = token(claims).split('.')
        return `${h}.${b64u({ ...claims, sub: 'attacker' })}.${s}`
      },
    ],
  ])('%s のトークンを拒否する', (_label, make) => {
    const { verifier } = setup()
    rejects(() => verifier.verify(make()))
  })

  it('未知の kid による再取得は60秒に1回まで', () => {
    const { verifier, fetchCount } = setup()
    verifier.verify(token(claims))
    rejects(() => verifier.verify(token(claims, { kid: 'unknown-1' })))
    rejects(() => verifier.verify(token(claims, { kid: 'unknown-2' })))
    expect(fetchCount()).toBe(2)
  })
})
