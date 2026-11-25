import { handleRequest } from '../api/dispatcher'
import { GoogleIdTokenVerifier } from '../auth/google-id-token-verifier'
import { createGasRuntime, openSpreadsheet } from '../infrastructure/gas-runtime'
import { SheetsTableStore, ensureSchema } from '../infrastructure/sheets-table-store'
import { SCHEMA_VERSION } from '../repositories/schema'
import { seedInitialData } from './setup'
import { runSelfTest as selfTest } from './self-test'
import { seedStagingDemoData } from './demo-seed'

function json(body: unknown): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

/**
 * スキーマのバージョンが古い場合に、不足している列を追加する（既存データは変更しない）。
 * デプロイ後の最初のリクエストで自動的に実行し、新しい列が保存されないまま運用されることを防ぐ。
 */
function migrateSchemaIfNeeded(
  runtime: ReturnType<typeof createGasRuntime>,
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
): void {
  if (runtime.config.schemaVersion === SCHEMA_VERSION) return
  runtime.withLock(() => {
    const props = PropertiesService.getScriptProperties()
    if (props.getProperty('SCHEMA_VERSION') === SCHEMA_VERSION) return
    const log = ensureSchema(spreadsheet)
    props.setProperty('SCHEMA_VERSION', SCHEMA_VERSION)
    runtime.cache.remove('tbl:criteria_items')
    console.log(`schema migrated to v${SCHEMA_VERSION}\n${log.join('\n')}`)
  })
}

/** API エンドポイント。Content-Type: text/plain の JSON ボディを受け付ける。 */
export function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  const runtime = createGasRuntime()
  try {
    const spreadsheet = openSpreadsheet()
    migrateSchemaIfNeeded(runtime, spreadsheet)
    const store = new SheetsTableStore(spreadsheet, runtime.cache)
    const verifier = new GoogleIdTokenVerifier(runtime, runtime.config.googleClientId)
    return json(handleRequest(e.postData?.contents ?? '', { store, runtime, verifier }))
  } catch (error) {
    runtime.logError('doPost bootstrap failed', error)
    return json({
      success: false,
      requestId: 'unknown',
      error: {
        code: 'INTERNAL_ERROR',
        message: 'サーバーの設定に問題があります。管理者に連絡してください。',
      },
    })
  }
}

/** 疎通確認用。データは返さない。 */
export function doGet(): GoogleAppsScript.Content.TextOutput {
  const runtime = createGasRuntime()
  return json({
    success: true,
    data: { status: 'ok', env: runtime.config.appEnv },
    requestId: 'get',
  })
}

/** スクリプトエディタから手動実行：シート初期化・マイグレーション・初期データ投入 */
export function setupSheets(): string[] {
  const runtime = createGasRuntime()
  return runtime.withLock(() => {
    const spreadsheet = openSpreadsheet()
    const log = ensureSchema(spreadsheet)
    log.push(...seedInitialData(new SheetsTableStore(spreadsheet, runtime.cache), runtime))
    PropertiesService.getScriptProperties().setProperty('SCHEMA_VERSION', SCHEMA_VERSION)
    console.log(log.join('\n'))
    return log
  })
}

export function runSelfTest(): string[] {
  return selfTest()
}

export { seedStagingDemoData }
