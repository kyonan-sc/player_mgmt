import { KEYUTIL } from 'jsrsasign'
import { z } from 'zod'
import { GOOGLE_CERTS_URL, GoogleIdTokenVerifier } from '../auth/google-id-token-verifier'
import { createGasRuntime, openSpreadsheet } from '../infrastructure/gas-runtime'
import { MemoryCache, type Runtime } from '../infrastructure/runtime'
import { escapeCell } from '../infrastructure/sheets-table-store'
import {
  SELFTEST_AUD,
  SELFTEST_JWKS,
  SELFTEST_NOW_MS,
  SELFTEST_UNVERIFIED_EMAIL_TOKEN,
  SELFTEST_VALID_TOKEN,
} from './self-test-fixture'

type Check = { name: string; run: () => void }

function expectThrows(fn: () => void, label: string): void {
  try {
    fn()
  } catch {
    return
  }
  throw new Error(`${label}: 例外が発生しませんでした`)
}

function fixtureVerifier(nowMs: number, aud = SELFTEST_AUD): GoogleIdTokenVerifier {
  const base = createGasRuntime()
  const runtime: Runtime = {
    ...base,
    now: () => new Date(nowMs),
    cache: new MemoryCache(() => nowMs),
    fetchText: () => ({
      status: 200,
      body: JSON.stringify(SELFTEST_JWKS),
      headers: { 'Cache-Control': 'max-age=3600' },
    }),
  }
  return new GoogleIdTokenVerifier(runtime, aud)
}

/**
 * GAS 実機で技術検証項目を確認する（Phase 0 / P0-05）。スクリプトエディタから実行する。
 * 結果は docs/03_実装計画.md の実機検証記録に転記する。
 */
export function runSelfTest(): string[] {
  const checks: Check[] = [
    {
      name: 'jsrsasign: 正しい署名のトークンを受理',
      run: () => {
        const claims = fixtureVerifier(SELFTEST_NOW_MS).verify(SELFTEST_VALID_TOKEN)
        if (claims.sub !== '1234567890') throw new Error('sub mismatch')
      },
    },
    {
      name: 'jsrsasign: 改ざんされたトークンを拒否',
      run: () => {
        const [h, p, s] = SELFTEST_VALID_TOKEN.split('.')
        const tampered = `${h}.${p!.slice(0, -2)}${p!.endsWith('A') ? 'B' : 'A'}${p!.slice(-1)}.${s}`
        expectThrows(() => fixtureVerifier(SELFTEST_NOW_MS).verify(tampered), 'tampered')
      },
    },
    {
      name: 'クレーム検証: aud 不一致・期限切れ・email 未検証を拒否',
      run: () => {
        expectThrows(
          () => fixtureVerifier(SELFTEST_NOW_MS, 'other').verify(SELFTEST_VALID_TOKEN),
          'aud',
        )
        expectThrows(
          () => fixtureVerifier(SELFTEST_NOW_MS + 7200_000).verify(SELFTEST_VALID_TOKEN),
          'exp',
        )
        expectThrows(
          () => fixtureVerifier(SELFTEST_NOW_MS).verify(SELFTEST_UNVERIFIED_EMAIL_TOKEN),
          'email',
        )
      },
    },
    {
      name: 'Google 公開鍵の取得と鍵オブジェクト生成',
      run: () => {
        const res = UrlFetchApp.fetch(GOOGLE_CERTS_URL, { muteHttpExceptions: true })
        if (res.getResponseCode() !== 200) throw new Error(`HTTP ${res.getResponseCode()}`)
        const keys = (JSON.parse(res.getContentText()) as { keys: { n: string; e: string }[] }).keys
        if (keys.length === 0) throw new Error('no keys')
        keys.forEach((k) => KEYUTIL.getKey({ kty: 'RSA', n: k.n, e: k.e } as never))
      },
    },
    {
      name: 'Zod: スキーマ検証が動作',
      run: () => {
        if (!z.object({ a: z.number() }).safeParse({ a: 1 }).success) throw new Error('zod failed')
      },
    },
    {
      name: 'CacheService / LockService',
      run: () => {
        const cache = CacheService.getScriptCache()
        cache.put('selftest', 'ok', 60)
        if (cache.get('selftest') !== 'ok') throw new Error('cache')
        const lock = LockService.getScriptLock()
        if (!lock.tryLock(5000)) throw new Error('lock')
        lock.releaseLock()
      },
    },
    {
      name: 'Sheets: 数式インジェクション防止・日付文字列の保持',
      run: () => {
        const ss = openSpreadsheet()
        const name = `__selftest_${Date.now()}`
        const sheet = ss.insertSheet(name)
        try {
          sheet.getRange(1, 1, 1, 3).setNumberFormat('@')
          const input = ['=1+1', '2026-06-01', '-負の値で始まる文章']
          sheet.getRange(1, 1, 1, 3).setValues([input.map((v) => escapeCell(v))])
          SpreadsheetApp.flush()
          const formulas = sheet.getRange(1, 1, 1, 3).getFormulas()[0]!
          const values = sheet.getRange(1, 1, 1, 3).getValues()[0]!.map(String)
          if (formulas.some((f) => f !== ''))
            throw new Error(`formula detected: ${JSON.stringify(formulas)}`)
          if (JSON.stringify(values) !== JSON.stringify(input))
            throw new Error(`mismatch: ${JSON.stringify(values)}`)
        } finally {
          ss.deleteSheet(sheet)
        }
      },
    },
  ]

  const results = checks.map((check) => {
    try {
      check.run()
      return `✅ ${check.name}`
    } catch (error) {
      return `❌ ${check.name}: ${error instanceof Error ? error.message : String(error)}`
    }
  })
  console.log(results.join('\n'))
  return results
}
