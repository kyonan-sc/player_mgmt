import { buildStandardCriteria } from '@kyonan/shared'
import type { Runtime } from '../infrastructure/runtime'
import type { TableStore } from '../infrastructure/table-store'
import { createDb } from '../repositories/db'

/** 初期評価基準を投入する。既に評価基準が存在する場合は何もしない（再実行可能）。 */
export function seedInitialData(store: TableStore, runtime: Runtime): string[] {
  const db = createDb(store)
  if (db.criteriaVersions.all().length > 0) return ['criteria: already initialized']
  const criteria = buildStandardCriteria(runtime.uuid(), runtime.now().toISOString(), 'system')
  db.criteriaVersions.insert(criteria.version)
  for (const { items, ...category } of criteria.categories) {
    db.criteriaCategories.insert(category)
    db.criteriaItems.insert(...items)
  }
  return [`criteria: seeded ${criteria.version.version}`]
}
