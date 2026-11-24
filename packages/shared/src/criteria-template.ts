import { DEFAULT_THRESHOLD_A, DEFAULT_THRESHOLD_B, INITIAL_CRITERIA } from './constants'
import type { CriteriaDefinition } from './types/entities'

/** 初期評価基準を CriteriaDefinition として構築する（テスト・シード・初期化で使用） */
export function buildInitialCriteria(
  versionId = 'criteria-v1',
  createdAt = '2026-01-01T00:00:00.000Z',
  createdBy = 'system',
): CriteriaDefinition {
  return {
    version: {
      id: versionId,
      version: 'v1',
      name: '初期評価基準',
      thresholdA: DEFAULT_THRESHOLD_A,
      thresholdB: DEFAULT_THRESHOLD_B,
      createdAt,
      createdBy,
    },
    categories: INITIAL_CRITERIA.map((c, ci) => {
      const categoryId = `${versionId}-${c.categoryKey}`
      return {
        id: categoryId,
        versionId,
        categoryKey: c.categoryKey,
        name: c.name,
        weight: c.weight,
        sortOrder: ci + 1,
        items: c.items.map((item, ii) => ({
          id: `${categoryId}-${item.itemKey}`,
          categoryId,
          itemKey: item.itemKey,
          name: item.name,
          description: item.description,
          rubric: item.rubric,
          sortOrder: ii + 1,
        })),
      }
    }),
  }
}
