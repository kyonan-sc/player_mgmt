import type { TableStore } from '../infrastructure/table-store'
import { TABLES, decodeRow, encodeRow, type TableDef, type TableKey } from './schema'

/** テーブル単位のリポジトリ。リクエスト内では読み取り結果をメモ化する。 */
export class Repository<T extends { id: string }> {
  private cache: T[] | null = null

  constructor(
    private readonly store: TableStore,
    private readonly def: TableDef<T>,
  ) {}

  all(): T[] {
    if (!this.cache) {
      this.cache = this.store
        .readAll(this.def.name)
        .filter((row) => row.id !== '' && row.id !== null && row.id !== undefined)
        .map((row) => decodeRow(this.def, row))
    }
    return this.cache
  }

  find(id: string): T | undefined {
    return this.all().find((e) => e.id === id)
  }

  filter(predicate: (e: T) => boolean): T[] {
    return this.all().filter(predicate)
  }

  insert(...entities: T[]): void {
    if (entities.length === 0) return
    this.store.insert(
      this.def.name,
      entities.map((e) => encodeRow(this.def, e)),
    )
    this.cache = null
  }

  update(...entities: T[]): void {
    if (entities.length === 0) return
    this.store.update(
      this.def.name,
      entities.map((e) => encodeRow(this.def, e)),
    )
    this.cache = null
  }

  remove(ids: string[]): void {
    if (ids.length === 0) return
    this.store.remove(this.def.name, ids)
    this.cache = null
  }
}

type Entity<K extends TableKey> = (typeof TABLES)[K] extends TableDef<infer E> ? E : never

export type Db = { [K in TableKey]: Repository<Entity<K> & { id: string }> }

export function createDb(store: TableStore): Db {
  const db = {} as Record<string, Repository<{ id: string }>>
  for (const key of Object.keys(TABLES) as TableKey[]) {
    db[key] = new Repository(store, TABLES[key] as TableDef<{ id: string }>)
  }
  return db as unknown as Db
}
