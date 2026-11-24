import { SCORE_MAX, SCORE_MIN, SPREAD_WARNING_THRESHOLD, TOTAL_WEIGHT } from '../constants'
import type { CriteriaDefinition, ItemScores, ResultStatus, Team } from '../types/entities'

/** 小数第1位に丸める（第2位で四捨五入、2進浮動小数誤差を補正）。S-03 */
export function roundScore(value: number): number {
  return Math.round(Number((value * 10).toFixed(6))) / 10
}

export function isValidScoreLevel(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= SCORE_MIN && (value as number) <= SCORE_MAX
}

export function listItemKeys(criteria: CriteriaDefinition): string[] {
  return criteria.categories.flatMap((c) => c.items.map((i) => i.itemKey))
}

export function findMissingItems(criteria: CriteriaDefinition, scores: ItemScores): string[] {
  return listItemKeys(criteria).filter((key) => !isValidScoreLevel(scores[key]))
}

export interface ScoreBreakdown {
  /** カテゴリ得点（丸めなし）。カテゴリ内の全項目が揃っていない場合は null */
  categoryScores: Record<string, number | null>
  /** 総合得点（小数第1位）。全カテゴリが揃っていない場合は null */
  totalScore: number | null
}

/**
 * 項目スコア（または項目別平均点）からカテゴリ得点と総合得点を計算する。
 * カテゴリ得点 = 項目得点の平均 ÷ 5 × カテゴリ配点。途中の丸めは行わない。
 */
export function computeScores(
  criteria: CriteriaDefinition,
  itemScores: Record<string, number | null | undefined>,
): ScoreBreakdown {
  const categoryScores: Record<string, number | null> = {}
  let total = 0
  let complete = true
  for (const category of criteria.categories) {
    const values = category.items.map((i) => itemScores[i.itemKey])
    if (values.length === 0 || values.some((v) => typeof v !== 'number' || Number.isNaN(v))) {
      categoryScores[category.categoryKey] = null
      complete = false
      continue
    }
    const avg = (values as number[]).reduce((a, b) => a + b, 0) / values.length
    const score = (avg / SCORE_MAX) * category.weight
    categoryScores[category.categoryKey] = score
    total += score
  }
  return { categoryScores, totalScore: complete ? roundScore(total) : null }
}

export function judgeTeam(
  totalScore: number | null,
  thresholds: { thresholdA: number; thresholdB: number },
): Team | null {
  if (totalScore === null) return null
  if (totalScore >= thresholds.thresholdA) return 'A'
  if (totalScore >= thresholds.thresholdB) return 'B'
  return 'C'
}

export interface ItemSpread {
  itemKey: string
  min: number
  max: number
  spread: number
}

export interface AggregatedResult {
  evaluatorCount: number
  itemScores: Record<string, number>
  categoryScores: Record<string, number>
  totalScore: number | null
  recommendedTeam: Team | null
  status: ResultStatus
  spreads: ItemSpread[]
  highSpreadItemKeys: string[]
}

/**
 * 提出済み評価を集計する。各項目について評価者の算術平均（等しい重み）を取り、
 * 必要評価者数に満たない場合は判定を行わない（未判定）。
 */
export function aggregateAssessments(
  criteria: CriteriaDefinition,
  submittedScores: ItemScores[],
  minEvaluatorCount: number,
): AggregatedResult {
  const itemKeys = listItemKeys(criteria)
  const valid = submittedScores.filter((s) => itemKeys.every((k) => isValidScoreLevel(s[k])))
  const evaluatorCount = valid.length
  const itemScores: Record<string, number> = {}
  const spreads: ItemSpread[] = []
  if (evaluatorCount > 0) {
    for (const key of itemKeys) {
      const values = valid.map((s) => s[key] as number)
      itemScores[key] = values.reduce((a, b) => a + b, 0) / values.length
      const min = Math.min(...values)
      const max = Math.max(...values)
      spreads.push({ itemKey: key, min, max, spread: max - min })
    }
  }
  const breakdown = evaluatorCount > 0 ? computeScores(criteria, itemScores) : null
  const categoryScores: Record<string, number> = {}
  if (breakdown) {
    for (const [key, value] of Object.entries(breakdown.categoryScores)) {
      if (value !== null) categoryScores[key] = value
    }
  }
  const sufficient = evaluatorCount >= Math.max(1, minEvaluatorCount)
  const totalScore = breakdown?.totalScore ?? null
  return {
    evaluatorCount,
    itemScores,
    categoryScores,
    totalScore,
    recommendedTeam: sufficient ? judgeTeam(totalScore, criteria.version) : null,
    status: sufficient ? 'complete' : 'insufficient',
    spreads,
    highSpreadItemKeys: spreads
      .filter((s) => s.spread >= SPREAD_WARNING_THRESHOLD)
      .map((s) => s.itemKey),
  }
}

/** 評価基準の互換性：カテゴリキー・配点・itemKey 集合が一致する場合のみ互換（S-05） */
export function isCriteriaCompatible(a: CriteriaDefinition, b: CriteriaDefinition): boolean {
  if (a.version.id === b.version.id) return true
  const signature = (c: CriteriaDefinition) =>
    c.categories
      .map(
        (cat) =>
          `${cat.categoryKey}:${cat.weight}:${cat.items
            .map((i) => i.itemKey)
            .sort()
            .join(',')}`,
      )
      .sort()
      .join('|')
  return signature(a) === signature(b)
}

export interface CriteriaValidationIssue {
  path: string
  message: string
}

export function validateCriteriaStructure(input: {
  thresholdA: number
  thresholdB: number
  categories: { categoryKey: string; weight: number; items: { itemKey: string }[] }[]
}): CriteriaValidationIssue[] {
  const issues: CriteriaValidationIssue[] = []
  const weightSum = input.categories.reduce((a, c) => a + c.weight, 0)
  if (Math.abs(weightSum - TOTAL_WEIGHT) > 1e-9) {
    issues.push({
      path: 'categories',
      message: `カテゴリ配点の合計が${TOTAL_WEIGHT}点ではありません（現在 ${weightSum}点）`,
    })
  }
  if (!(input.thresholdA > input.thresholdB)) {
    issues.push({ path: 'thresholdA', message: 'A判定の下限はB判定の下限より大きくしてください' })
  }
  const categoryKeys = new Set<string>()
  const itemKeys = new Set<string>()
  input.categories.forEach((c, ci) => {
    if (categoryKeys.has(c.categoryKey)) {
      issues.push({ path: `categories.${ci}.categoryKey`, message: 'カテゴリキーが重複しています' })
    }
    categoryKeys.add(c.categoryKey)
    if (c.items.length === 0) {
      issues.push({ path: `categories.${ci}.items`, message: '評価項目を1つ以上設定してください' })
    }
    c.items.forEach((i, ii) => {
      if (itemKeys.has(i.itemKey)) {
        issues.push({
          path: `categories.${ci}.items.${ii}.itemKey`,
          message: '項目キーが重複しています',
        })
      }
      itemKeys.add(i.itemKey)
    })
  })
  return issues
}
