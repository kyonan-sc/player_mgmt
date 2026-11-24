import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { beforeAll, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))
let code = ''

beforeAll(() => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' })
  code = readFileSync(`${root}dist/Code.js`, 'utf8')
}, 60_000)

/** Node 固有 API を持たない素の V8 コンテキストに、最小限の GAS サービスのスタブを用意する */
function gasSandbox(overrides: Record<string, string> = {}) {
  const props: Record<string, string> = {
    APP_ENV: 'test',
    GOOGLE_CLIENT_ID: 'cid',
    SPREADSHEET_ID: 'sid',
    ...overrides,
  }
  const cache = new Map<string, string>()
  return vm.createContext({
    console: { log() {}, error() {} },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache.get(k) ?? null,
        put: (k: string, v: string) => void cache.set(k, v),
        remove: (k: string) => void cache.delete(k),
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      getUuid: () => 'uuid',
      // GAS は符号付きバイト列（-128〜127）を返す
      computeHmacSha256Signature: (message: string, key: string) =>
        [...createHmac('sha256', key).update(message).digest()].map((b) => (b > 127 ? b - 256 : b)),
    },
    SpreadsheetApp: {
      openById: () => ({ getSpreadsheetTimeZone: () => 'Asia/Tokyo' }),
      flush() {},
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text: string) => ({ setMimeType: () => ({ text }) }),
    },
  })
}

function call(
  ctx: vm.Context,
  action: string,
  payload: unknown = {},
  idToken: string | null = null,
) {
  const body = JSON.stringify({
    action,
    requestId: `req-${Math.random().toString(36).slice(2)}-x`,
    idToken,
    payload,
  })
  const out = vm.runInContext(
    `doPost({ postData: { contents: ${JSON.stringify(body)} } })`,
    ctx,
  ) as { text: string }
  return JSON.parse(out.text) as {
    success: boolean
    error?: { code: string }
    data?: { token: string }
  }
}

describe('GAS バンドル', () => {
  it('モック用の検証器を含まない（S-10）', () => {
    expect(code).not.toContain('MockIdTokenVerifier')
    expect(code).not.toContain('mock-sub-')
  })

  it('Node/ブラウザ固有 API なしの V8 環境で doPost(health.check) が応答する', () => {
    const ctx = gasSandbox()
    vm.runInContext(code, ctx)
    const body = JSON.stringify({ action: 'health.check', requestId: 'req-00000001', payload: {} })
    const out = vm.runInContext(
      `doPost({ postData: { contents: ${JSON.stringify(body)} } })`,
      ctx,
    ) as { text: string }
    expect(JSON.parse(out.text)).toMatchObject({
      success: true,
      data: { status: 'ok', env: 'test' },
    })
  })

  it('トークンなしの保護 API は UNAUTHENTICATED', () => {
    const ctx = gasSandbox()
    vm.runInContext(code, ctx)
    const body = JSON.stringify({ action: 'players.list', requestId: 'req-00000002', payload: {} })
    const out = vm.runInContext(
      `doPost({ postData: { contents: ${JSON.stringify(body)} } })`,
      ctx,
    ) as { text: string }
    expect(JSON.parse(out.text)).toMatchObject({
      success: false,
      error: { code: 'UNAUTHENTICATED' },
    })
  })

  it('検証用データ投入は APP_ENV=staging 以外では何もせず拒否する', () => {
    const ctx = gasSandbox()
    vm.runInContext(code, ctx)
    expect(() => vm.runInContext('seedStagingDemoData()', ctx)).toThrow(/APP_ENV=staging/)
  })

  it('パスワード入場：staging では GAS 形式の HMAC で署名したトークンを発行し、誤ったパスワードは拒否する', () => {
    const ctx = gasSandbox({ APP_ENV: 'staging', GUEST_VIEWER_PASSWORD: 'stg-guest-pass-2026' })
    vm.runInContext(code, ctx)
    const ok = call(ctx, 'auth.guestLogin', { password: 'stg-guest-pass-2026' })
    expect(ok.success).toBe(true)
    expect(ok.data?.token).toMatch(/^guest\.\d+\.[0-9a-f]{64}$/)
    expect(call(ctx, 'auth.guestLogin', { password: 'nope-nope-nope' })).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    })
  })

  it('パスワード入場：本番（APP_ENV=production）ではパスワードが設定されていても拒否する', () => {
    const ctx = gasSandbox({ APP_ENV: 'production', GUEST_VIEWER_PASSWORD: 'stg-guest-pass-2026' })
    vm.runInContext(code, ctx)
    expect(call(ctx, 'auth.guestLogin', { password: 'stg-guest-pass-2026' })).toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
