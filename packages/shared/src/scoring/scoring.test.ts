import { describe, expect, it } from 'vitest'
import { buildInitialCriteria } from '../criteria-template'
import {
  aggregateAssessments,
  computeScores,
  findMissingItems,
  isCriteriaCompatible,
  judgeTeam,
  roundScore,
  validateCriteriaStructure,
} from './index'

const criteria = buildInitialCriteria()
const keys = [
  'TEC-01',
  'TEC-02',
  'TEC-03',
  'DEC-01',
  'DEC-02',
  'DUE-01',
  'DUE-02',
  'INV-01',
  'INV-02',
]
const uniform = (v: number) => Object.fromEntries(keys.map((k) => [k, v]))

describe('computeScores', () => {
  it('技術力 4,5,3 の平均4は24点（仕様書の計算例）', () => {
    const r = computeScores(criteria, { 'TEC-01': 4, 'TEC-02': 5, 'TEC-03': 3 })
    expect(r.categoryScores.TEC).toBe(24)
    expect(r.totalScore).toBeNull()
  })

  it('全項目1点で20点、全項目5点で100点', () => {
    expect(computeScores(criteria, uniform(1)).totalScore).toBe(20)
    expect(computeScores(criteria, uniform(5)).totalScore).toBe(100)
  })

  it('途中で丸めず最終的な総合得点のみ小数第1位に丸める', () => {
    // TEC: (4+4+3)/3/5*30 = 22, DEC: 3/5*25=15, DUE: 3.5/5*25=17.5, INV: 3/5*20=12 → 66.5
    const scores = { ...uniform(3), 'TEC-01': 4, 'TEC-02': 4, 'DUE-01': 4 }
    expect(computeScores(criteria, scores).totalScore).toBe(66.5)
    // TEC: (4+3+3)/3/5*30 = 20 → カテゴリ得点に端数がある例
    const r = computeScores(criteria, { ...uniform(3), 'TEC-01': 4, 'DEC-01': 4 })
    expect(r.categoryScores.DEC).toBeCloseTo(17.5)
    expect(r.categoryScores.TEC).toBeCloseTo(20)
    expect(r.totalScore).toBe(64.5)
  })

  it('未評価（null）を含むカテゴリは得点を出さない', () => {
    const r = computeScores(criteria, { ...uniform(3), 'INV-02': null })
    expect(r.categoryScores.INV).toBeNull()
    expect(r.categoryScores.TEC).toBe(18)
    expect(r.totalScore).toBeNull()
  })
})

describe('roundScore', () => {
  it('浮動小数誤差を補正して四捨五入する', () => {
    expect(roundScore(79.95)).toBe(80)
    expect(roundScore(79.94999)).toBe(79.9)
    expect(roundScore(0.1 + 0.2)).toBe(0.3)
  })
})

describe('judgeTeam', () => {
  const t = { thresholdA: 80, thresholdB: 60 }
  it.each([
    [100, 'A'],
    [80, 'A'],
    [79.9, 'B'],
    [60, 'B'],
    [59.9, 'C'],
    [20, 'C'],
  ])('%s点は%sチーム', (score, team) => {
    expect(judgeTeam(score, t)).toBe(team)
  })
  it('得点なしは未判定', () => expect(judgeTeam(null, t)).toBeNull())
})

describe('aggregateAssessments', () => {
  it('提出済み評価の項目別算術平均から得点を計算する', () => {
    const r = aggregateAssessments(criteria, [uniform(4), uniform(5)], 2)
    expect(r.evaluatorCount).toBe(2)
    expect(r.itemScores['TEC-01']).toBe(4.5)
    expect(r.totalScore).toBe(90)
    expect(r.recommendedTeam).toBe('A')
    expect(r.status).toBe('complete')
  })

  it('必要評価者数に満たない場合は未判定（insufficient）', () => {
    const r = aggregateAssessments(criteria, [uniform(4)], 2)
    expect(r.status).toBe('insufficient')
    expect(r.recommendedTeam).toBeNull()
    expect(r.totalScore).toBe(80)
  })

  it('評価者がいない場合は得点なし', () => {
    const r = aggregateAssessments(criteria, [], 2)
    expect(r.totalScore).toBeNull()
    expect(r.evaluatorCount).toBe(0)
  })

  it('未入力項目を含む評価は集計対象外', () => {
    const r = aggregateAssessments(criteria, [uniform(4), { ...uniform(1), 'TEC-01': null }], 1)
    expect(r.evaluatorCount).toBe(1)
    expect(r.totalScore).toBe(80)
  })

  it('最大と最小の差が2点以上の項目をばらつき大として検出し、除外はしない', () => {
    const r = aggregateAssessments(
      criteria,
      [uniform(3), { ...uniform(3), 'DEC-01': 5 }, { ...uniform(3), 'DEC-01': 4 }],
      2,
    )
    expect(r.highSpreadItemKeys).toEqual(['DEC-01'])
    expect(r.itemScores['DEC-01']).toBe(4)
  })
})

describe('isCriteriaCompatible / findMissingItems / validateCriteriaStructure', () => {
  it('itemKey・配点が同じなら互換、配点が異なれば非互換', () => {
    const other = buildInitialCriteria('criteria-v2')
    expect(isCriteriaCompatible(criteria, other)).toBe(true)
    other.categories[0]!.weight = 25
    other.categories[1]!.weight = 30
    expect(isCriteriaCompatible(criteria, other)).toBe(false)
  })

  it('未入力項目を列挙する', () => {
    expect(findMissingItems(criteria, { ...uniform(3), 'INV-01': null })).toEqual(['INV-01'])
  })

  it('配点合計100点、A>B を検証する', () => {
    const input = {
      thresholdA: 60,
      thresholdB: 60,
      categories: [{ categoryKey: 'X', weight: 90, items: [{ itemKey: 'X-1' }] }],
    }
    const issues = validateCriteriaStructure(input).map((i) => i.path)
    expect(issues).toEqual(['categories', 'thresholdA'])
  })
})
