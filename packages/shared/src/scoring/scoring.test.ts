import { describe, expect, it } from 'vitest'
import { buildInitialCriteria, buildStandardCriteria } from '../criteria-template'
import {
  aggregateAssessments,
  computeScores,
  findInvalidItems,
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

describe('練習への取り組み（3段階＋未観察）', () => {
  const standard = buildStandardCriteria()
  const eng = ['ENG-01', 'ENG-02', 'ENG-03', 'ENG-04']
  const base = (v: number, engagement: Record<string, number | null> = {}) => ({
    ...uniform(v),
    ...Object.fromEntries(eng.map((k) => [k, null])),
    ...engagement,
  })

  it('標準の評価基準は配点合計100点（25/20/25/20/10）で、取り組みの4項目は3段階・未観察可', () => {
    expect(standard.categories.map((c) => c.weight)).toEqual([25, 20, 25, 20, 10])
    const items = standard.categories.find((c) => c.categoryKey === 'ENG')!.items
    expect(items.map((i) => [i.maxScore, i.allowUnobserved])).toEqual([
      [3, true],
      [3, true],
      [3, true],
      [3, true],
    ])
    expect(
      validateCriteriaStructure({ ...standard.version, categories: standard.categories }),
    ).toEqual([])
  })

  it('3段階の項目は「得点÷3」で換算する（全項目3点で配点10点満点、全項目1点で約3.3点）', () => {
    const all3 = computeScores(
      standard,
      base(5, { 'ENG-01': 3, 'ENG-02': 3, 'ENG-03': 3, 'ENG-04': 3 }),
    )
    expect(all3.categoryScores.ENG).toBeCloseTo(10)
    expect(all3.totalScore).toBe(100)
    const all1 = computeScores(
      standard,
      base(5, { 'ENG-01': 1, 'ENG-02': 1, 'ENG-03': 1, 'ENG-04': 1 }),
    )
    expect(all1.categoryScores.ENG).toBeCloseTo(10 / 3)
    expect(all1.totalScore).toBe(93.3)
  })

  it('未観察の項目は平均から除く（2項目のみ観察：3点と2点 → 平均 5/6 × 10点）', () => {
    const r = computeScores(standard, base(5, { 'ENG-01': 3, 'ENG-03': 2 }))
    expect(r.categoryScores.ENG).toBeCloseTo((5 / 6) * 10)
  })

  it('取り組みの全項目が未観察でも総合が出る。観察できたカテゴリの配点（90点）で100点に換算する', () => {
    const r = computeScores(standard, base(4))
    expect(r.categoryScores.ENG).toBeNull()
    // 4点/5点 = 80%。取り組みを除く90点分で80%なので、総合は80.0
    expect(r.totalScore).toBe(80)
  })

  it('未観察を許可していない必須項目が未入力なら、総合は出さない', () => {
    const r = computeScores(standard, { ...base(4), 'TEC-01': null })
    expect(r.totalScore).toBeNull()
  })

  it('提出に必要なのは必須9項目のみ。満点を超える値は不正', () => {
    expect(findMissingItems(standard, base(3))).toEqual([])
    expect(findMissingItems(standard, { ...base(3), 'DEC-01': null })).toEqual(['DEC-01'])
    expect(findInvalidItems(standard, base(3, { 'ENG-01': 4 }))).toEqual(['ENG-01'])
    expect(findInvalidItems(standard, { ...base(3), 'TEC-01': 6 })).toEqual(['TEC-01'])
    expect(findInvalidItems(standard, base(3, { 'ENG-01': 3 }))).toEqual([])
  })

  it('複数評価者：項目を観察した評価者だけで平均し、誰も観察していない項目は集計から除く', () => {
    const r = aggregateAssessments(
      standard,
      [base(4, { 'ENG-01': 3, 'ENG-02': 1 }), base(4, { 'ENG-01': 1 }), base(4)],
      2,
    )
    expect(r.evaluatorCount).toBe(3)
    expect(r.itemScores['ENG-01']).toBe(2) // (3+1)/2。観察していない評価者は含めない
    expect(r.itemScores['ENG-02']).toBe(1)
    expect(r.itemScores['ENG-03']).toBeUndefined()
    expect(r.itemScores['TEC-01']).toBe(4)
    expect(r.status).toBe('complete')
  })

  it('取り組みの未観察は評価不足にならないが、必須項目が欠けた評価は集計対象外', () => {
    const r = aggregateAssessments(standard, [base(4), { ...base(4), 'INV-02': null }], 1)
    expect(r.evaluatorCount).toBe(1)
  })

  it('取り組みを含む基準と含まない基準は互換でない（差分を出さない）', () => {
    expect(isCriteriaCompatible(buildInitialCriteria(), standard)).toBe(false)
  })
})
