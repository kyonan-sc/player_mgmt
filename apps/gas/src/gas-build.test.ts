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
function gasSandbox() {
  const props: Record<string, string> = {
    APP_ENV: 'test',
    GOOGLE_CLIENT_ID: 'cid',
    SPREADSHEET_ID: 'sid',
  }
  return vm.createContext({
    console: { log() {}, error() {} },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }),
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => 'uuid' },
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
})
