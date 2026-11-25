import {
  DEFAULT_THRESHOLD_A,
  DEFAULT_THRESHOLD_B,
  INITIAL_CRITERIA,
  STANDARD_CRITERIA,
  type CriteriaTemplateCategory,
} from './constants'
import type { CriteriaDefinition } from './types/entities'

function buildFromTemplate(
  template: CriteriaTemplateCategory[],
  meta: { versionId: string; version: string; name: string; createdAt: string; createdBy: string },
): CriteriaDefinition {
  const { versionId } = meta
  return {
    version: {
      id: versionId,
      version: meta.version,
      name: meta.name,
      thresholdA: DEFAULT_THRESHOLD_A,
      thresholdB: DEFAULT_THRESHOLD_B,
      createdAt: meta.createdAt,
      createdBy: meta.createdBy,
    },
    categories: template.map((c, ci) => {
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
          maxScore: item.maxScore ?? 5,
          allowUnobserved: item.allowUnobserved ?? false,
        })),
      }
    }),
  }
}

/** 基本の4カテゴリ・9項目（要件仕様 3章の初期評価基準）。テスト・デモの履歴で使用する */
export function buildInitialCriteria(
  versionId = 'criteria-v1',
  createdAt = '2026-01-01T00:00:00.000Z',
  createdBy = 'system',
): CriteriaDefinition {
  return buildFromTemplate(INITIAL_CRITERIA, {
    versionId,
    version: 'v1',
    name: '初期評価基準',
    createdAt,
    createdBy,
  })
}

/** 標準の評価基準：基本の4カテゴリ（配点調整）＋「練習への取り組み」（3段階）。新規環境の初期データ */
export function buildStandardCriteria(
  versionId = 'criteria-standard',
  createdAt = '2026-01-01T00:00:00.000Z',
  createdBy = 'system',
  options: { version?: string; name?: string } = {},
): CriteriaDefinition {
  return buildFromTemplate(STANDARD_CRITERIA, {
    versionId,
    version: options.version ?? 'v1',
    name: options.name ?? '標準評価基準',
    createdAt,
    createdBy,
  })
}
