import { SCORE_MAX, SCORE_MIN, SPREAD_WARNING_THRESHOLD, TOTAL_WEIGHT } from '../constants'
import type {
  CriteriaDefinition,
  CriteriaItem,
  ItemScores,
  ResultStatus,
  Team,
} from '../types/entities'

/** 小数第1位に丸める（第2位で四捨五入、2進浮動小数誤差を補正）。S-03 */
export function roundScore(value: number): number {
  return Math.round(Number((value * 10).toFixed(6))) / 10
}

export function isValidScoreLevel(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= SCORE_MIN && (value as number) <= SCORE_MAX
}

/** 項目の満点。未設定（旧データ）は 5 段階として扱う */
export const itemMax = (item: Pick<CriteriaItem, 'maxScore'>): number =>
  item.maxScore > 0 ? item.maxScore : SCORE_MAX

/** その項目の段階（1〜満点の整数）として有効な値か */
export function isValidItemScore(
  value: unknown,
  item: Pick<CriteriaItem, 'maxScore'>,
): value is number {
  return (
    Number.isInteger(value) && (value as number) >= SCORE_MIN && (value as number) <= itemMax(item)
  )
}

export function listItemKeys(criteria: CriteriaDefinition): string[] {
  return criteria.categories.flatMap((c) => c.items.map((i) => i.itemKey))
}

export function listItems(criteria: CriteriaDefinition): CriteriaItem[] {
  return criteria.categories.flatMap((c) => c.items)
}

/** 提出に必須の項目（未観察を許可していない項目） */
export function listRequiredItems(criteria: CriteriaDefinition): CriteriaItem[] {
  return listItems(criteria).filter((i) => !i.allowUnobserved)
}

/** 未入力の必須項目。未観察を許可した項目は、未入力（未観察）でも不足にならない */
export function findMissingItems(criteria: CriteriaDefinition, scores: ItemScores): string[] {
  return listRequiredItems(criteria)
    .filter((item) => !isValidItemScore(scores[item.itemKey], item))
    .map((item) => item.itemKey)
}

/** 評価基準で許されない値（満点を超える点数など）が入力されている項目 */
export function findInvalidItems(criteria: CriteriaDefinition, scores: ItemScores): string[] {
  return listItems(criteria)
    .filter((item) => {
      const value = scores[item.itemKey]
      return value !== null && value !== undefined && !isValidItemScore(value, item)
    })
    .map((item) => item.itemKey)
}

export interface ScoreBreakdown {
  /** カテゴリ得点（丸めなし）。必須項目が揃っていない、または全項目が未観察のカテゴリは null */
  categoryScores: Record<string, number | null>
  /** 総合得点（小数第1位）。必須項目が揃っていない場合は null */
  totalScore: number | null
}

/**
 * 項目スコア（または項目別平均点）からカテゴリ得点と総合得点を計算する。
 *
 * - カテゴリ得点 = 観察できた項目の「得点 ÷ 項目の満点」の平均 × カテゴリ配点。途中の丸めは行わない。
 * - 全項目が未観察のカテゴリは得点を出さず、総合は観察できたカテゴリの配点で100点に換算する。
 *   （全カテゴリを観察できた場合は、配点合計100点のためそのままの合計になる）
 * - 必須項目（未観察を許可していない項目）が未入力のカテゴリがある場合、総合は出さない。
 */
export function computeScores(
  criteria: CriteriaDefinition,
  itemScores: Record<string, number | null | undefined>,
): ScoreBreakdown {
  const categoryScores: Record<string, number | null> = {}
  let total = 0
  let observedWeight = 0
  let complete = true
  for (const category of criteria.categories) {
    const items = category.items
    const valueOf = (item: CriteriaItem) => {
      const v = itemScores[item.itemKey]
      return typeof v === 'number' && !Number.isNaN(v) ? v : null
    }
    if (items.length === 0 || items.some((i) => !i.allowUnobserved && valueOf(i) === null)) {
      categoryScores[category.categoryKey] = null
      complete = false
      continue
    }
    const observed = items.flatMap((i) => {
      const v = valueOf(i)
      return v === null ? [] : [{ v, max: itemMax(i) }]
    })
    if (observed.length === 0) {
      categoryScores[category.categoryKey] = null
      continue
    }
    // 満点が同じ項目だけなら「平均 ÷ 満点」（従来どおり）。満点が混在する場合は項目ごとの達成率の平均
    const sameMax = observed.every((o) => o.max === observed[0]!.max)
    const ratio = sameMax
      ? observed.reduce((a, o) => a + o.v, 0) / observed.length / observed[0]!.max
      : observed.reduce((a, o) => a + o.v / o.max, 0) / observed.length
    const score = ratio * category.weight
    categoryScores[category.categoryKey] = score
    total += score
    observedWeight += category.weight
  }
  if (!complete || observedWeight <= 0) return { categoryScores, totalScore: null }
  const normalized =
    observedWeight === TOTAL_WEIGHT ? total : (total / observedWeight) * TOTAL_WEIGHT
  return { categoryScores, totalScore: roundScore(normalized) }
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
  const items = listItems(criteria)
  // 必須項目がすべて入力された評価だけを集計対象にする（未観察を許可した項目は null でもよい）
  const valid = submittedScores.filter(
    (s) => findMissingItems(criteria, s).length === 0 && findInvalidItems(criteria, s).length === 0,
  )
  const evaluatorCount = valid.length
  const itemScores: Record<string, number> = {}
  const spreads: ItemSpread[] = []
  if (evaluatorCount > 0) {
    for (const item of items) {
      // 項目を観察した評価者だけの平均。誰も観察していない項目は集計から除く
      const values = valid
        .map((s) => s[item.itemKey])
        .filter((v): v is number => isValidItemScore(v, item))
      if (values.length === 0) continue
      itemScores[item.itemKey] = values.reduce((a, b) => a + b, 0) / values.length
      const min = Math.min(...values)
      const max = Math.max(...values)
      spreads.push({ itemKey: item.itemKey, min, max, spread: max - min })
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
