import {
  aggregateAssessments,
  buildInitialCriteria,
  buildStandardCriteria,
  listItems,
  type CriteriaItem,
  type Assessment,
  type AssessmentCycle,
  type AssessmentResult,
  type Coach,
  type CriteriaDefinition,
  type CyclePlayer,
  type Group,
  type ItemScores,
  type Player,
  type Team,
  type TeamAssignment,
} from '@kyonan/shared'
import { encodeRow, TABLES, type Row } from '@kyonan/gas/core'
import { MOCK_USERS } from './mock-users'

/** 再現可能な疑似乱数（mulberry32） */
function createRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const MOCK_SEED = 20261124

const FAMILY = [
  '佐藤',
  '鈴木',
  '高橋',
  '田中',
  '伊藤',
  '渡辺',
  '山本',
  '中村',
  '小林',
  '加藤',
  '吉田',
  '山田',
  '佐々木',
  '山口',
  '松本',
  '井上',
  '木村',
  '林',
  '清水',
  '山崎',
  '森',
  '池田',
  '橋本',
  '阿部',
  '石川',
  '前田',
  '藤田',
  '小川',
  '岡田',
  '後藤',
]
const GIVEN = [
  '蓮',
  '陽翔',
  '湊',
  '蒼',
  '樹',
  '大和',
  '悠真',
  '陽太',
  '朝陽',
  '律',
  '颯',
  '奏太',
  '新',
  '碧',
  '湊斗',
  '結翔',
  '陸',
  '悠人',
  '瑛太',
  '晴',
  '大翔',
  '海斗',
  '蒼空',
  '一颯',
  '旭',
  '翼',
  '暖',
  '健太',
  '拓海',
  '航',
]

type Trend = 'steady' | 'fast' | 'plateau' | 'late' | 'dip'
const TRENDS: Trend[] = ['steady', 'fast', 'plateau', 'late', 'dip']

const CYCLE_DEFS = [
  { name: '2026年4月評価', start: '2026-04-06', end: '2026-04-19' },
  { name: '2026年5月評価', start: '2026-05-18', end: '2026-05-31' },
  { name: '2026年6月評価', start: '2026-06-22', end: '2026-07-05' },
  { name: '2026年8月評価', start: '2026-08-03', end: '2026-08-16' },
  { name: '2026年9月評価', start: '2026-09-14', end: '2026-09-27' },
  { name: '2026年10月評価', start: '2026-10-19', end: '2026-11-01' },
  { name: '2026年11月評価', start: '2026-11-16', end: '2026-11-29' },
]

const iso = (date: string, hour = 12) => `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * モック用データセット（すべて架空）。
 * 選手30名・コーチ4名・確定済み評価期間6回＋実施中1回、成長傾向・評価不足・評価ばらつき・チーム変更履歴を含む。
 */
export function buildMockDataset(seed = MOCK_SEED): Record<string, Row[]> {
  const rand = createRandom(seed)
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!
  const created = iso('2026-03-01', 0)

  const groups: Group[] = [
    { id: 'group-2018', name: '3年生', cohortYear: 2018, status: 'active' },
    { id: 'group-2017', name: '4年生', cohortYear: 2017, status: 'active' },
  ]
  const groupId = groups[0]!.id

  const coaches: Coach[] = MOCK_USERS.map((u, i) => ({
    id: `coach-${i + 1}`,
    googleSub: null,
    email: u.email,
    displayName: u.name,
    role: u.role,
    status: 'active',
    createdAt: created,
    updatedAt: created,
  }))
  const coachGroups = coaches
    .slice(1)
    .map((c, i) => ({ id: `cg-${i + 1}`, coachId: c.id, groupId }))
  const evaluators = coaches.slice(0, 3)

  const criteriaV1 = buildInitialCriteria('criteria-v1', iso('2026-03-01', 0), 'coach-1')
  // v2：評価内容の文言を改訂（構造・配点は同一のため互換）
  const criteriaV2: CriteriaDefinition = buildInitialCriteria(
    'criteria-v2',
    iso('2026-08-01', 0),
    'coach-1',
  )
  criteriaV2.version = { ...criteriaV2.version, version: 'v2', name: '2026年度 改訂基準' }
  criteriaV2.categories[1]!.items[0]!.description =
    '味方・相手・スペースを、ボールを受ける前から認識しているか'
  // v3：配点を調整（25/20/25/20）して「練習への取り組み」（10点・3段階）を追加
  const criteriaV3: CriteriaDefinition = buildStandardCriteria(
    'criteria-v3',
    iso('2026-09-01', 0),
    'coach-1',
    { version: 'v3', name: '2026年度 標準基準（練習への取り組みを追加）' },
  )
  criteriaV3.categories[1]!.items[0]!.description =
    '味方・相手・スペースを、ボールを受ける前から認識しているか'
  const V3_FROM = 4
  const criteriaFor = (t: number) => (t >= V3_FROM ? criteriaV3 : t >= 3 ? criteriaV2 : criteriaV1)

  const itemKeys = criteriaV1.categories.flatMap((c) => c.items.map((i) => i.itemKey))

  const players: Player[] = Array.from({ length: 30 }, (_, i) => ({
    id: `player-${String(i + 1).padStart(2, '0')}`,
    displayName: `${FAMILY[i]} ${GIVEN[(i * 7) % GIVEN.length]}`,
    jerseyNumber: i + 1,
    enrollmentGrade: i < 22 ? 1 : pick([2, 3]),
    enrollmentYear: i < 22 ? 2024 : pick([2025, 2026]),
    groupId,
    joinedDate: i < 22 ? '2024-04-01' : '2025-09-01',
    status: i === 29 ? 'inactive' : 'active',
    createdAt: created,
    updatedAt: created,
  }))

  const profiles = players.map((p, i) => ({
    player: p,
    base: Object.fromEntries(
      itemKeys.map((k) => [k, 1.6 + rand() * 2.0 + (i % 5 === 0 ? 0.6 : 0)]),
    ),
    // 練習への取り組み（3段階）の基準値
    engagement: 1.6 + rand() * 1.4,
    trend: TRENDS[i % TRENDS.length]!,
    // 一部の選手は担当コーチによって見え方が大きく異なる（評価ばらつき）
    divergent: i === 4 || i === 17,
  }))

  function trueLevel(profile: (typeof profiles)[number], key: string, t: number): number {
    const base = profile.base[key]!
    const growth = {
      steady: 0.18,
      fast: 0.32,
      plateau: t < 3 ? 0.25 : 0.02,
      late: t < 3 ? 0.02 : 0.38,
      dip: t === 3 ? -0.3 : 0.15,
    }[profile.trend]
    return base + growth * t
  }
  const clampScore = (v: number) => Math.max(1, Math.min(5, Math.round(v)))

  const cycles: AssessmentCycle[] = []
  const cyclePlayers: CyclePlayer[] = []
  const assessments: Assessment[] = []
  const results: AssessmentResult[] = []
  const teamAssignments: TeamAssignment[] = []
  const currentTeam = new Map<string, Team | null>()
  let seq = 0
  const nextId = (prefix: string) => `${prefix}-${String(++seq).padStart(5, '0')}`

  CYCLE_DEFS.forEach((def, t) => {
    const isOpen = t === CYCLE_DEFS.length - 1
    const criteria = criteriaFor(t)
    const criteriaItems = listItems(criteria)
    const cycle: AssessmentCycle = {
      id: `cycle-${t + 1}`,
      groupId,
      name: def.name,
      startDate: def.start,
      endDate: def.end,
      criteriaVersionId: criteria.version.id,
      minEvaluatorCount: 2,
      status: isOpen ? 'open' : 'finalized',
      createdBy: 'coach-1',
      createdAt: iso(addDays(def.start, -7)),
      finalizedAt: isOpen ? null : iso(addDays(def.end, 2)),
      finalizedBy: isOpen ? null : 'coach-1',
    }
    cycles.push(cycle)
    // 30番は10月評価の後に退団
    const targets = profiles.filter((p) => p.player.status === 'active' || t < 6)

    for (const profile of targets) {
      cyclePlayers.push({ id: nextId('cp'), cycleId: cycle.id, playerId: profile.player.id })
      const submittedScores: ItemScores[] = []
      // 項目の得点を作る（練習への取り組みは3段階）
      const scoreOf = (item: CriteriaItem): number => {
        if (item.maxScore !== 3)
          return clampScore(trueLevel(profile, item.itemKey, t) + (rand() - 0.5) * 0.9)
        const v = profile.engagement + 0.08 * t + (rand() - 0.5) * 1.1
        return Math.max(1, Math.min(3, Math.round(v)))
      }
      evaluators.forEach((coach, ci) => {
        if (isOpen) {
          // 実施中：田中コーチは一部提出済み・一部下書き、佐藤コーチは一部提出済み、監督は未着手
          const n = Number(profile.player.jerseyNumber)
          const status =
            ci === 1
              ? n <= 12
                ? 'submitted'
                : n <= 15
                  ? 'draft'
                  : null
              : ci === 2
                ? n <= 8
                  ? 'submitted'
                  : null
                : null
          if (!status) return
          const scores = Object.fromEntries(
            criteriaItems.map((item, ki) => [
              item.itemKey,
              status === 'draft' && ki > 5 ? null : scoreOf(item),
            ]),
          )
          assessments.push(
            makeAssessment(cycle, profile.player.id, coach.id, scores, status, def.start, rand),
          )
          return
        }
        // 評価不足：一部の選手は1名のみが評価
        const skip = ci === 2 && (Number(profile.player.jerseyNumber) + t) % 9 === 0
        if (skip || (ci === 0 && rand() < 0.5)) return
        const scores = Object.fromEntries(
          criteriaItems.map((item) => {
            const k = item.itemKey
            const v = scoreOf(item)
            if (profile.divergent && ci === 1 && (k === 'DEC-01' || k === 'DUE-02')) {
              return [k, clampScore(v + 2)]
            }
            return [k, v]
          }),
        )
        submittedScores.push(scores)
        assessments.push(
          makeAssessment(cycle, profile.player.id, coach.id, scores, 'submitted', def.start, rand),
        )
      })

      if (isOpen) continue
      const agg = aggregateAssessments(criteria, submittedScores, cycle.minEvaluatorCount)
      results.push({
        id: nextId('result'),
        cycleId: cycle.id,
        playerId: profile.player.id,
        evaluatorCount: agg.evaluatorCount,
        itemScores: agg.itemScores,
        categoryScores: agg.categoryScores,
        totalScore: agg.totalScore,
        recommendedTeam: agg.recommendedTeam,
        status: agg.status,
        criteriaVersionId: criteria.version.id,
        finalizedAt: cycle.finalizedAt!,
      })

      // 確定1週間後に編成を見直す。基本は推奨どおり、一部はコーチ協議で調整
      const recommended = agg.recommendedTeam
      const previous = currentTeam.get(profile.player.id)
      let assigned: Team | null = recommended ?? previous ?? null
      let reason = recommended ? '' : '評価者数不足のため前回の所属を継続'
      if (recommended && Number(profile.player.jerseyNumber) % 11 === t) {
        assigned = recommended === 'A' ? 'B' : recommended === 'C' ? 'B' : 'A'
        reason =
          recommended === 'C'
            ? '試合での積極性を評価し、Bチームで経験を積ませる'
            : 'ポジションバランスを考慮'
      }
      if (assigned !== previous && !(assigned === null && previous === undefined)) {
        teamAssignments.push({
          id: nextId('ta'),
          cycleId: cycle.id,
          playerId: profile.player.id,
          recommendedTeam: recommended,
          assignedTeam: assigned,
          reason: assigned === recommended ? '' : reason,
          effectiveDate: addDays(def.end, 9),
          assignedBy: 'coach-1',
          createdAt: iso(addDays(def.end, 9)),
        })
        currentTeam.set(profile.player.id, assigned)
      }
    }
  })

  function makeAssessment(
    cycle: AssessmentCycle,
    playerId: string,
    evaluatorId: string,
    scores: ItemScores,
    status: 'draft' | 'submitted',
    date: string,
    random: () => number,
  ): Assessment {
    const ts = iso(addDays(date, Math.floor(random() * 10)), 9 + Math.floor(random() * 8))
    const strengths =
      random() < 0.6
        ? pick([
            'ボールを受ける前の首振りが増えた',
            '1対1で仕掛ける姿勢がある',
            '守備への切り替えが速い',
            '声を出して味方をサポートできる',
          ])
        : ''
    const improvementPoints =
      random() < 0.6
        ? pick([
            '逆足でのトラップ',
            'パスの強さの調整',
            '奪われた後の反応',
            'ボールを持たない時の立ち位置',
          ])
        : ''
    return {
      id: nextId('as'),
      cycleId: cycle.id,
      playerId,
      evaluatorId,
      scores,
      strengths,
      improvementPoints,
      comment: '',
      status,
      revision: status === 'submitted' ? 2 : 1,
      createdAt: ts,
      updatedAt: ts,
      submittedAt: status === 'submitted' ? ts : null,
    }
  }

  const criteriaRows = [criteriaV1, criteriaV2, criteriaV3]
  return {
    [TABLES.groups.name]: groups.map((g) => encodeRow(TABLES.groups, g)),
    [TABLES.coaches.name]: coaches.map((c) => encodeRow(TABLES.coaches, c)),
    [TABLES.coachGroups.name]: coachGroups.map((c) => encodeRow(TABLES.coachGroups, c)),
    [TABLES.players.name]: players.map((p) => encodeRow(TABLES.players, p)),
    [TABLES.criteriaVersions.name]: criteriaRows.map((c) =>
      encodeRow(TABLES.criteriaVersions, c.version),
    ),
    [TABLES.criteriaCategories.name]: criteriaRows.flatMap((c) =>
      c.categories.map(({ items: _items, ...cat }) => encodeRow(TABLES.criteriaCategories, cat)),
    ),
    [TABLES.criteriaItems.name]: criteriaRows.flatMap((c) =>
      c.categories.flatMap((cat) => cat.items.map((i) => encodeRow(TABLES.criteriaItems, i))),
    ),
    [TABLES.cycles.name]: cycles.map((c) => encodeRow(TABLES.cycles, c)),
    [TABLES.cyclePlayers.name]: cyclePlayers.map((c) => encodeRow(TABLES.cyclePlayers, c)),
    [TABLES.assessments.name]: assessments.map((a) => encodeRow(TABLES.assessments, a)),
    [TABLES.results.name]: results.map((r) => encodeRow(TABLES.results, r)),
    [TABLES.teamAssignments.name]: teamAssignments.map((t) => encodeRow(TABLES.teamAssignments, t)),
    [TABLES.appSettings.name]: [
      encodeRow(TABLES.appSettings, {
        id: 'defaultCriteriaVersionId',
        value: 'criteria-v3',
        updatedAt: created,
        updatedBy: 'coach-1',
      }),
    ],
  }
}
