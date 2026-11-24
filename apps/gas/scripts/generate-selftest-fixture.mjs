// GAS 実機セルフテスト用の JWT フィクスチャを生成する。
// 生成した秘密鍵は保存せず破棄する（公開鍵と署名済みトークンのみを出力）。
import { generateKeyPairSync, sign } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'selftest-key',
  alg: 'RS256',
  use: 'sig',
}
const b64u = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')

const AUD = 'selftest-client-id'
const IAT = 1_800_000_000
function makeToken(payload) {
  const input = `${b64u({ alg: 'RS256', kid: 'selftest-key', typ: 'JWT' })}.${b64u(payload)}`
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`
}
const base = {
  iss: 'https://accounts.google.com',
  aud: AUD,
  sub: '1234567890',
  email: 'selftest@example.com',
  email_verified: true,
  iat: IAT,
  exp: IAT + 3600,
}

const out = `// 自動生成: node scripts/generate-selftest-fixture.mjs（テスト専用の鍵。本番では使用しない）
export const SELFTEST_AUD = ${JSON.stringify(AUD)}
export const SELFTEST_NOW_MS = ${(IAT + 60) * 1000}
export const SELFTEST_JWKS = ${JSON.stringify({ keys: [jwk] })}
export const SELFTEST_VALID_TOKEN = ${JSON.stringify(makeToken(base))}
export const SELFTEST_UNVERIFIED_EMAIL_TOKEN = ${JSON.stringify(makeToken({ ...base, email_verified: false }))}
`
writeFileSync(
  fileURLToPath(new URL('../src/entrypoints/self-test-fixture.ts', import.meta.url)),
  out,
)
console.log('fixture written')
