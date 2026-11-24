export type Cell = string | number | boolean | null
export type Row = Record<string, Cell>

/**
 * 1シート = 1テーブルの永続化層。Sheets 実装とインメモリ実装を差し替え可能にする。
 * すべての行は文字列キー `id` を主キーとして持つ。
 */
export interface TableStore {
  readAll(table: string): Row[]
  insert(table: string, rows: Row[]): void
  update(table: string, rows: Row[]): void
  /** 関連テーブル（coach_groups 等）の付け替え専用。評価データには使用しない。 */
  remove(table: string, ids: string[]): void
}

export class MemoryTableStore implements TableStore {
  private readonly tables = new Map<string, Row[]>()

  constructor(initial?: Record<string, Row[]>) {
    if (initial) {
      for (const [name, rows] of Object.entries(initial)) {
        this.tables.set(
          name,
          rows.map((r) => ({ ...r })),
        )
      }
    }
  }

  readAll(table: string): Row[] {
    return (this.tables.get(table) ?? []).map((r) => ({ ...r }))
  }

  insert(table: string, rows: Row[]): void {
    const current = this.tables.get(table) ?? []
    for (const row of rows) {
      if (current.some((r) => r.id === row.id))
        throw new Error(`Duplicate id in ${table}: ${row.id}`)
      current.push({ ...row })
    }
    this.tables.set(table, current)
  }

  update(table: string, rows: Row[]): void {
    const current = this.tables.get(table) ?? []
    for (const row of rows) {
      const index = current.findIndex((r) => r.id === row.id)
      if (index < 0) throw new Error(`Row not found in ${table}: ${row.id}`)
      current[index] = { ...row }
    }
  }

  remove(table: string, ids: string[]): void {
    const set = new Set(ids)
    this.tables.set(
      table,
      (this.tables.get(table) ?? []).filter((r) => !set.has(String(r.id))),
    )
  }

  snapshot(): Record<string, Row[]> {
    return Object.fromEntries(
      [...this.tables.entries()].map(([k, v]) => [k, v.map((r) => ({ ...r }))]),
    )
  }
}
