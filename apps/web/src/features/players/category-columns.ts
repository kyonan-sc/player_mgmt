import type { CriteriaDefinition, PlayerListItem } from '@kyonan/shared'

export interface CategoryColumn {
  key: string
  label: string
}

/**
 * 選手一覧のカテゴリ列を、各選手の最新結果で使われている評価基準から決める。
 * 新しい評価期間の基準を優先して並べ、旧基準にしかないカテゴリは後ろに追加する。
 * 確定結果がまだない場合は最新の評価基準のカテゴリを表示する。
 */
export function categoryColumnsFor(
  rows: PlayerListItem[],
  criteria: CriteriaDefinition[],
): CategoryColumn[] {
  const byId = new Map(criteria.map((c) => [c.version.id, c]))
  const versionIds = rows
    .flatMap((r) => (r.latest ? [r.latest] : []))
    .sort((a, b) => b.cycleEndDate.localeCompare(a.cycleEndDate))
    .map((s) => s.criteriaVersionId)
  const ordered = [...new Set(versionIds)].map((id) => byId.get(id)).filter((c) => c !== undefined)
  if (ordered.length === 0 && criteria.length > 0) ordered.push(criteria[criteria.length - 1]!)

  const columns = new Map<string, string>()
  for (const def of ordered) {
    for (const cat of def.categories) {
      if (!columns.has(cat.categoryKey)) columns.set(cat.categoryKey, cat.name)
    }
  }
  return [...columns].map(([key, label]) => ({ key, label }))
}
