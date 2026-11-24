import { ALL_TABLES } from '../repositories/schema'
import type { CacheLike } from './runtime'
import type { Cell, Row, TableStore } from './table-store'

/** 数式として解釈されうる先頭文字（数式インジェクション対策、C-10） */
const FORMULA_PREFIX = /^[=+\-@\t\r]/
/** CacheService に載せるマスタ系テーブル */
const CACHEABLE = new Set([
  'groups',
  'coaches',
  'coach_groups',
  'criteria_versions',
  'criteria_categories',
  'criteria_items',
  'app_settings',
])
const CACHE_TTL_SECONDS = 600

export function escapeCell(value: Cell): Cell {
  if (typeof value === 'string' && FORMULA_PREFIX.test(value)) return `'${value}`
  return value
}

function normalizeCell(value: unknown, timeZone: string): Cell {
  if (value instanceof Date)
    return Utilities.formatDate(value, timeZone, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')
    return value
  return String(value)
}

interface LoadedTable {
  sheet: GoogleAppsScript.Spreadsheet.Sheet
  header: string[]
  rows: Row[]
  rowIndexById: Map<string, number>
}

/**
 * Google Sheets 実装。1シート = 1テーブル、1行目がカラム名。
 * 読み書きは getValues / setValues による一括操作を基本とする。
 */
export class SheetsTableStore implements TableStore {
  private readonly loaded = new Map<string, LoadedTable>()
  private readonly timeZone: string

  constructor(
    private readonly spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
    private readonly cache: CacheLike,
  ) {
    this.timeZone = spreadsheet.getSpreadsheetTimeZone()
  }

  readAll(table: string): Row[] {
    return this.load(table).rows.map((r) => ({ ...r }))
  }

  insert(table: string, rows: Row[]): void {
    if (rows.length === 0) return
    const t = this.load(table)
    const values = rows.map((row) => t.header.map((h) => escapeCell(row[h] ?? '')))
    const start = t.sheet.getLastRow() + 1
    t.sheet.getRange(start, 1, values.length, t.header.length).setValues(values)
    this.invalidate(table)
  }

  update(table: string, rows: Row[]): void {
    if (rows.length === 0) return
    const t = this.load(table)
    for (const row of rows) {
      const rowIndex = t.rowIndexById.get(String(row.id))
      if (rowIndex === undefined) throw new Error(`Row not found in ${table}: ${String(row.id)}`)
      const values = [t.header.map((h) => escapeCell(row[h] ?? ''))]
      t.sheet.getRange(rowIndex, 1, 1, t.header.length).setValues(values)
    }
    this.invalidate(table)
  }

  remove(table: string, ids: string[]): void {
    if (ids.length === 0) return
    const t = this.load(table)
    const indices = ids
      .map((id) => t.rowIndexById.get(id))
      .filter((i): i is number => i !== undefined)
      .sort((a, b) => b - a)
    for (const index of indices) t.sheet.deleteRow(index)
    this.invalidate(table)
  }

  private load(table: string): LoadedTable {
    const existing = this.loaded.get(table)
    if (existing) return existing
    const sheet = this.spreadsheet.getSheetByName(table)
    if (!sheet) throw new Error(`Sheet not found: ${table}. Run setupSheets().`)

    let values: unknown[][] | null = null
    const cacheKey = `tbl:${table}`
    if (CACHEABLE.has(table)) {
      const cached = this.cache.get(cacheKey)
      if (cached) values = JSON.parse(cached) as unknown[][]
    }
    if (!values) {
      values = sheet.getDataRange().getValues()
      if (CACHEABLE.has(table)) {
        const serialized = JSON.stringify(
          values.map((r) => r.map((v) => normalizeCell(v, this.timeZone))),
        )
        try {
          if (serialized.length < 90_000) this.cache.put(cacheKey, serialized, CACHE_TTL_SECONDS)
        } catch {
          // キャッシュは最適化のみのため失敗しても処理を継続する
        }
      }
    }

    const header = (values[0] ?? []).map((h) => String(h))
    const rows: Row[] = []
    const rowIndexById = new Map<string, number>()
    for (let i = 1; i < values.length; i++) {
      const row: Row = {}
      header.forEach((h, c) => {
        row[h] = normalizeCell(values![i]![c], this.timeZone)
      })
      if (row.id === '' || row.id === undefined) continue
      rows.push(row)
      rowIndexById.set(String(row.id), i + 1)
    }
    const loaded = { sheet, header, rows, rowIndexById }
    this.loaded.set(table, loaded)
    return loaded
  }

  private invalidate(table: string): void {
    this.loaded.delete(table)
    if (CACHEABLE.has(table)) this.cache.remove(`tbl:${table}`)
  }
}

/** シート初期化・マイグレーション。不足しているシート・カラムを追加し、既存データは変更しない。 */
export function ensureSchema(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): string[] {
  const log: string[] = []
  for (const def of ALL_TABLES) {
    let sheet = spreadsheet.getSheetByName(def.name)
    const columns = def.columns.map((c) => c.column)
    if (!sheet) {
      sheet = spreadsheet.insertSheet(def.name)
      log.push(`created sheet ${def.name}`)
    }
    // 日付文字列等の自動変換を防ぐため、シート全体を書式なしテキストにする（T-07）
    sheet
      .getRange(1, 1, sheet.getMaxRows(), Math.max(sheet.getMaxColumns(), columns.length))
      .setNumberFormat('@')
    const lastColumn = sheet.getLastColumn()
    const header =
      lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0]!.map(String) : []
    const missing = columns.filter((c) => !header.includes(c))
    if (missing.length > 0) {
      sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing])
      log.push(`${def.name}: added columns ${missing.join(', ')}`)
    }
    sheet.setFrozenRows(1)
  }
  return log
}
