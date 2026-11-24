import { buildInitialCriteria, type CriteriaDefinition, type PlayerListItem } from '@kyonan/shared'
import { describe, expect, it } from 'vitest'
import { categoryColumnsFor } from './category-columns'

const v1 = buildInitialCriteria('v1')
// v2：対人能力（DUE）を削除し、フィジカル（PHY）を追加
const v2: CriteriaDefinition = buildInitialCriteria('v2')
v2.categories = [
  ...v2.categories.filter((c) => c.categoryKey !== 'DUE'),
  { ...v2.categories[0]!, id: 'v2-PHY', categoryKey: 'PHY', name: 'フィジカル', items: [] },
]

const row = (criteriaVersionId: string | null, cycleEndDate = '2026-01-01') =>
  ({
    latest: criteriaVersionId ? { criteriaVersionId, cycleEndDate } : null,
  }) as PlayerListItem

describe('categoryColumnsFor', () => {
  it('最新の評価基準のカテゴリを優先し、旧基準のみのカテゴリを後ろに並べる', () => {
    const cols = categoryColumnsFor([row('v1', '2026-03-01'), row('v2', '2026-09-01')], [v1, v2])
    expect(cols.map((c) => c.key)).toEqual(['TEC', 'DEC', 'INV', 'PHY', 'DUE'])
    expect(cols.find((c) => c.key === 'PHY')?.label).toBe('フィジカル')
  })

  it('全選手が新基準で評価されていれば、削除したカテゴリは列に出ない', () => {
    const cols = categoryColumnsFor([row('v2'), row('v2')], [v1, v2])
    expect(cols.map((c) => c.key)).not.toContain('DUE')
  })

  it('確定結果がまだない場合は最新の評価基準のカテゴリを表示する', () => {
    expect(categoryColumnsFor([row(null)], [v1, v2]).map((c) => c.key)).toEqual([
      'TEC',
      'DEC',
      'INV',
      'PHY',
    ])
  })
})
