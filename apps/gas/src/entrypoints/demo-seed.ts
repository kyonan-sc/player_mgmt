import { buildStagingDemoDataset, type RealAdmin } from '../dev/demo-dataset'
import { createGasRuntime, openSpreadsheet } from '../infrastructure/gas-runtime'
import {
  SheetsTableStore,
  ensureSchema,
  resetAllTableData,
} from '../infrastructure/sheets-table-store'
import { createDb } from '../repositories/db'

/** 検証環境以外でのデータ消去・投入を防ぐ */
export function assertStagingEnv(appEnv: string): void {
  if (appEnv !== 'staging') {
    throw new Error(
      `この操作は APP_ENV=staging でのみ実行できます（現在: ${appEnv}）。本番データは消去されていません。`,
    )
  }
}

/**
 * スクリプトエディタから手動実行：検証環境の全データを消去し、約1年運用相当のダミーデータを投入する。
 * BOOTSTRAP_ADMIN_EMAIL の管理者は（既存の Google アカウント紐付けを保ったまま）残す。
 */
export function seedStagingDemoData(): string[] {
  const runtime = createGasRuntime()
  assertStagingEnv(runtime.config.appEnv)
  return runtime.withLock(() => {
    const spreadsheet = openSpreadsheet()
    ensureSchema(spreadsheet)

    const adminEmail = runtime.config.bootstrapAdminEmail?.toLowerCase() ?? null
    let realAdmin: RealAdmin | null = null
    if (adminEmail) {
      const existing = createDb(new SheetsTableStore(spreadsheet, runtime.cache))
        .coaches.all()
        .find((c) => c.email.toLowerCase() === adminEmail)
      realAdmin = {
        email: adminEmail,
        googleSub: existing?.googleSub ?? null,
        id: existing?.id,
        displayName: existing?.displayName,
      }
    }

    const { tables, summary } = buildStagingDemoDataset({ realAdmin })
    resetAllTableData(
      spreadsheet,
      runtime.cache,
      Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
    )
    const store = new SheetsTableStore(spreadsheet, runtime.cache)
    for (const [name, rows] of Object.entries(tables)) store.insert(name, rows)

    const log = ['検証用ダミーデータを投入しました', ...summary]
    console.log(log.join('\n'))
    return log
  })
}
