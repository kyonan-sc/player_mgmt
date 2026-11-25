import {
  aggregateAssessments,
  listItems,
  buildInitialCriteria,
  buildStandardCriteria,
  type Assessment,
  type AssessmentCycle,
  type AssessmentResult,
  type AuditLog,
  type Coach,
  type CoachGroup,
  type CriteriaDefinition,
  type CriteriaItem,
  type CyclePlayer,
  type Group,
  type ItemScores,
  type Player,
  type Role,
  type Team,
  type TeamAssignment,
} from '@kyonan/shared'
import type { Row } from '../infrastructure/table-store'
import { encodeRow, TABLES } from '../repositories/schema'

/**
 * 検証環境（staging）用のダミーデータ。約1年間（2025年12月〜2026年11月）運用した状態を再現する。
 * すべて架空の人物で、メールアドレスは配送不能な example ドメインを使用する。
 */

export const DEMO_EMAIL_DOMAIN = 'staging.kyonan-sc.example'
const GROUP_ID = 'group-2018'

interface DemoCoachDef {
  key: string
  name: string
  role: Role
  /** この評価期間インデックス以降は退任（無効） */
  leftAtCycle?: number
  /** 評価の甘さ（+で甘い、−で厳しい） */
  bias: number
}

const DEMO_COACHES: DemoCoachDef[] = [
  { key: 'yamamoto', name: '山本 健一', role: 'admin', bias: 0 },
  { key: 'kojima', name: '小島 直樹', role: 'admin', bias: -0.1 },
  { key: 'tanaka', name: '田中 誠', role: 'coach', bias: 0.2 },
  { key: 'sato', name: '佐藤 翔太', role: 'coach', bias: -0.3 },
  { key: 'takahashi', name: '高橋 亮', role: 'coach', bias: 0.1 },
  { key: 'ito', name: '伊藤 大輔', role: 'coach', bias: 0 },
  { key: 'watanabe', name: '渡辺 拓也', role: 'coach', bias: 0.3 },
  { key: 'nakamura', name: '中村 慎吾', role: 'coach', bias: -0.15 },
  { key: 'kobayashi', name: '小林 洋平', role: 'coach', bias: 0.05 },
  { key: 'kato', name: '加藤 雄一', role: 'coach', bias: 0.15, leftAtCycle: 5 },
  { key: 'suzuki', name: '鈴木 由美', role: 'viewer', bias: 0 },
  { key: 'matsuda', name: '松田 恵', role: 'viewer', bias: 0 },
]

const CYCLES = [
  { name: '2025年12月評価', start: '2025-12-01', end: '2025-12-14' },
  { name: '2026年1月評価', start: '2026-01-19', end: '2026-02-01' },
  { name: '2026年3月評価', start: '2026-03-02', end: '2026-03-15' },
  { name: '2026年4月評価', start: '2026-04-13', end: '2026-04-26' },
  { name: '2026年5月評価', start: '2026-05-25', end: '2026-06-07' },
  { name: '2026年7月評価', start: '2026-07-06', end: '2026-07-19' },
  { name: '2026年8月評価', start: '2026-08-24', end: '2026-09-06' },
  { name: '2026年9月評価', start: '2026-09-28', end: '2026-10-11' },
  { name: '2026年10月評価', start: '2026-10-26', end: '2026-11-08' },
  { name: '2026年11月評価', start: '2026-11-16', end: '2026-11-29' },
]
/** この評価期間インデックス以降は改訂基準（v2） */
const CRITERIA_V2_FROM = 5
/** この評価期間インデックス以降は「練習への取り組み」を加えた基準（v3） */
const CRITERIA_V3_FROM = 7

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
  '長谷川',
  '村上',
  '近藤',
  '石井',
  '坂本',
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
  '凪',
  '颯真',
  '琉生',
  '壮真',
  '玲央',
]

/** 途中入団（選手インデックス → 最初に評価される評価期間） */
const JOINERS: Record<number, number> = { 30: 2, 31: 4, 32: 6, 33: 6, 34: 8 }
/** 退団（選手インデックス → 最後に評価された評価期間） */
const LEAVERS: Record<number, number> = { 8: 3, 19: 6 }

type Trend = 'steady' | 'fast' | 'plateau' | 'late' | 'dip'
const TRENDS: Trend[] = ['steady', 'fast', 'plateau', 'late', 'dip', 'steady']

const STRENGTHS = [
  'ボールを受ける前の首振りが増えた',
  '1対1で積極的に仕掛けられる',
  '守備への切り替えが速い',
  '声を出して味方をサポートできる',
  '逆足でも落ち着いてトラップできる',
  'パスの強さを状況に合わせて調整できている',
  'スペースへの動き出しが良い',
  'ボールを奪われても諦めずに追いかける',
]
const IMPROVEMENTS = [
  '逆足でのトラップ',
  'パスを出した後の動き直し',
  '奪われた直後の反応',
  'ボールを持たない時の立ち位置',
  '顔を上げてドリブルする',
  '守備時の体の向き',
  '仕掛けるか預けるかの判断',
]
const COMMENTS = [
  '',
  '',
  '',
  '練習への取り組みが非常に真剣',
  '試合で見せる集中力が上がってきた',
  '体調不良で観察回数が少なめ',
]
const OVERRIDE_REASONS = [
  'ポジションバランスを考慮',
  '試合での積極性を評価し、上位チームで経験を積ませる',
  'けが明けのため負荷を調整',
  'コーチ協議の結果、現所属で継続',
]

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

const iso = (date: string, hour = 3) => `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const pad = (n: number) => String(n).padStart(2, '0')

function growth(trend: Trend, t: number): number {
  switch (trend) {
    case 'steady':
      return 0.09 * t
    case 'fast':
      return 0.15 * t
    case 'plateau':
      return 0.15 * Math.min(t, 4) + 0.02 * Math.max(0, t - 4)
    case 'late':
      return 0.02 * Math.min(t, 4) + 0.18 * Math.max(0, t - 4)
    case 'dip':
      return 0.09 * t - (t === 5 || t === 6 ? 0.5 : 0)
  }
}
const clampScore = (v: number) => Math.max(1, Math.min(5, Math.round(v)))

export interface RealAdmin {
  email: string
  googleSub: string | null
  id?: string
  displayName?: string
}

export interface DemoDataset {
  tables: Record<string, Row[]>
  summary: string[]
}

export function buildStagingDemoDataset(
  options: { seed?: number; realAdmin?: RealAdmin | null } = {},
): DemoDataset {
  const rand = createRandom(options.seed ?? 20261124)
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!
  const created = iso('2025-11-20')

  const groups: Group[] = [
    { id: GROUP_ID, name: '3年生', cohortYear: 2018, status: 'active' },
    { id: 'group-2017', name: '4年生', cohortYear: 2017, status: 'active' },
  ]

  const coaches: Coach[] = DEMO_COACHES.map((c, i) => ({
    id: `coach-${pad(i + 1)}`,
    googleSub: null,
    email: `${c.key}@${DEMO_EMAIL_DOMAIN}`,
    displayName: c.name,
    role: c.role,
    status: c.leftAtCycle === undefined ? 'active' : 'inactive',
    createdAt: created,
    updatedAt: c.leftAtCycle === undefined ? created : iso(CYCLES[c.leftAtCycle]!.start),
  }))
  if (options.realAdmin) {
    coaches.push({
      id: options.realAdmin.id ?? 'coach-owner',
      googleSub: options.realAdmin.googleSub,
      email: options.realAdmin.email.toLowerCase(),
      displayName: options.realAdmin.displayName ?? options.realAdmin.email,
      role: 'admin',
      status: 'active',
      createdAt: created,
      updatedAt: created,
    })
  }
  const coachGroups: CoachGroup[] = coaches
    .filter((c) => c.role !== 'admin')
    .map((c, i) => ({ id: `cg-${pad(i + 1)}`, coachId: c.id, groupId: GROUP_ID }))

  const reviseWording = (c: CriteriaDefinition) => {
    c.categories[1]!.items[0]!.description =
      '味方・相手・スペースを、ボールを受ける前から認識しているか'
    c.categories[3]!.items[1]!.description =
      'ボールを失った直後に、近くの味方と連携して守備へ切り替えられるか'
  }
  const criteriaV1 = buildInitialCriteria('criteria-v1', created, 'coach-01')
  const criteriaV2: CriteriaDefinition = buildInitialCriteria(
    'criteria-v2',
    iso(addDays(CYCLES[CRITERIA_V2_FROM]!.start, -14)),
    'coach-01',
  )
  criteriaV2.version = { ...criteriaV2.version, version: 'v2', name: '2026年度 改訂基準' }
  reviseWording(criteriaV2)
  // v3：配点を調整（25/20/25/20）して「練習への取り組み」（10点・3段階＋未観察）を追加
  const criteriaV3: CriteriaDefinition = buildStandardCriteria(
    'criteria-v3',
    iso(addDays(CYCLES[CRITERIA_V3_FROM]!.start, -14)),
    'coach-01',
    { version: 'v3', name: '2026年度 標準基準（練習への取り組みを追加）' },
  )
  reviseWording(criteriaV3)
  const criteriaFor = (t: number) =>
    t >= CRITERIA_V3_FROM ? criteriaV3 : t >= CRITERIA_V2_FROM ? criteriaV2 : criteriaV1
  /** 5段階の項目（基本の9項目）。選手ごとの力量はこのキーで持つ */
  const itemKeys = criteriaV1.categories.flatMap((c) => c.items.map((i) => i.itemKey))

  const players: Player[] = Array.from({ length: 35 }, (_, i) => {
    const join = JOINERS[i]
    const leave = LEAVERS[i]
    const joinedDate = join === undefined ? '2024-04-01' : addDays(CYCLES[join]!.start, -20)
    return {
      id: `player-${pad(i + 1)}`,
      displayName: `${FAMILY[i]} ${GIVEN[(i * 11) % GIVEN.length]}`,
      jerseyNumber: i + 1,
      enrollmentGrade: join === undefined ? 1 : join < 4 ? 2 : 3,
      enrollmentYear: join === undefined ? 2024 : Number(joinedDate.slice(0, 4)),
      groupId: GROUP_ID,
      joinedDate,
      status: leave === undefined ? 'active' : 'inactive',
      createdAt: join === undefined ? created : iso(joinedDate),
      updatedAt: leave === undefined ? created : iso(CYCLES[leave + 1]!.start),
    }
  })

  const profiles = players.map((player, i) => ({
    player,
    index: i,
    joinedAt: JOINERS[i] ?? 0,
    base: (() => {
      // 選手ごとの総合的な力量に、項目ごとの得意・不得意を加える
      const talent =
        2.0 + rand() * 2.1 + (i % 7 === 0 ? 0.3 : 0) - (JOINERS[i] !== undefined ? 0.3 : 0)
      return Object.fromEntries(itemKeys.map((k) => [k, talent + (rand() - 0.5) * 0.8]))
    })(),
    // 練習への取り組み（3段階の基準値）と、練習を欠席・見学する割合
    engagement: 1.6 + rand() * 1.4,
    absence: 0.04 + rand() * 0.2,
    trend: TRENDS[i % TRENDS.length]!,
    divergent: i === 4 || i === 17 || i === 26,
  }))

  const cycles: AssessmentCycle[] = []
  const cyclePlayers: CyclePlayer[] = []
  const assessments: Assessment[] = []
  const results: AssessmentResult[] = []
  const teamAssignments: TeamAssignment[] = []
  const auditLogs: AuditLog[] = []
  const currentTeam = new Map<string, Team | null>()
  let seq = 0
  const nextId = (prefix: string) => `${prefix}-${String(++seq).padStart(5, '0')}`
  const log = (
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    createdAt: string,
  ) =>
    auditLogs.push({
      id: nextId('log'),
      actorId,
      action,
      targetType,
      targetId,
      requestId: nextId('demo'),
      createdAt,
    })

  const makeAssessment = (
    cycle: AssessmentCycle,
    playerId: string,
    evaluatorId: string,
    scores: ItemScores,
    status: 'draft' | 'submitted',
  ): Assessment => {
    const ts = iso(addDays(cycle.startDate, Math.floor(rand() * 12)), 1 + Math.floor(rand() * 11))
    return {
      id: nextId('as'),
      cycleId: cycle.id,
      playerId,
      evaluatorId,
      scores,
      strengths: rand() < 0.55 ? pick(STRENGTHS) : '',
      improvementPoints: rand() < 0.5 ? pick(IMPROVEMENTS) : '',
      comment: pick(COMMENTS),
      status,
      revision: status === 'submitted' ? 1 + Math.floor(rand() * 3) : 1,
      createdAt: ts,
      updatedAt: ts,
      submittedAt: status === 'submitted' ? ts : null,
    }
  }

  CYCLES.forEach((def, t) => {
    const isOpen = t === CYCLES.length - 1
    const criteria = criteriaFor(t)
    const criteriaItems = listItems(criteria)
    const cycle: AssessmentCycle = {
      id: `cycle-${pad(t + 1)}`,
      groupId: GROUP_ID,
      name: def.name,
      startDate: def.start,
      endDate: def.end,
      criteriaVersionId: criteria.version.id,
      minEvaluatorCount: 2,
      status: isOpen ? 'open' : 'finalized',
      createdBy: 'coach-01',
      createdAt: iso(addDays(def.start, -7)),
      finalizedAt: isOpen ? null : iso(addDays(def.end, 2), 11),
      finalizedBy: isOpen ? null : t % 3 === 2 ? 'coach-02' : 'coach-01',
    }
    cycles.push(cycle)
    log('coach-01', 'cycles.create', 'cycle', cycle.id, cycle.createdAt)
    log('coach-01', 'cycles.open', 'cycle', cycle.id, iso(def.start))
    if (cycle.finalizedAt)
      log(cycle.finalizedBy!, 'cycles.finalize', 'cycle', cycle.id, cycle.finalizedAt)

    const evaluators = DEMO_COACHES.map((d, i) => ({ def: d, coach: coaches[i]! })).filter(
      (e) => e.def.role !== 'viewer' && (e.def.leftAtCycle === undefined || t < e.def.leftAtCycle),
    )
    const targets = profiles.filter(
      (p) => p.joinedAt <= t && (LEAVERS[p.index] === undefined || t <= LEAVERS[p.index]!),
    )

    for (const profile of targets) {
      cyclePlayers.push({ id: nextId('cp'), cycleId: cycle.id, playerId: profile.player.id })
      const level = (key: string, bias: number) =>
        profile.base[key]! +
        growth(profile.trend, t - profile.joinedAt) +
        bias +
        (rand() - 0.5) * 0.9
      /**
       * 項目の得点を作る。3段階の項目（練習への取り組み）は、欠席・見学の日は全項目が未観察（null）、
       * 出席していても一部の項目は観察できない（null）ことがある。
       */
      const scoreOf = (item: CriteriaItem, bias: number, attended: boolean): number | null => {
        if (item.maxScore !== 3) return clampScore(level(item.itemKey, bias))
        if (!attended || rand() < 0.1) return null
        const v =
          profile.engagement + 0.08 * (t - profile.joinedAt) + bias * 0.5 + (rand() - 0.5) * 1.1
        return Math.max(1, Math.min(3, Math.round(v)))
      }
      // 担当コーチを優先し、監督（admin）は評価機会を少なめにする
      const pool = evaluators
        .map((e) => ({ e, order: rand() + (e.def.role === 'admin' ? 0.6 : 0) }))
        .sort((a, b) => a.order - b.order)
        .map((x) => x.e)

      if (isOpen) {
        for (const e of pool) {
          const r = rand()
          if (r > 0.42) continue
          const draft = r > 0.34
          const attended = rand() > profile.absence
          const scores = Object.fromEntries(
            criteriaItems.map((item, ki) => [
              item.itemKey,
              draft && ki > 4 ? null : scoreOf(item, e.def.bias, attended),
            ]),
          )
          assessments.push(
            makeAssessment(
              cycle,
              profile.player.id,
              e.coach.id,
              scores,
              draft ? 'draft' : 'submitted',
            ),
          )
        }
        continue
      }

      const r = rand()
      const count = r < 0.08 ? 1 : r < 0.6 ? 2 : r < 0.93 ? 3 : 4
      const submitted: ItemScores[] = []
      pool.slice(0, count).forEach((e, ei) => {
        const attended = rand() > profile.absence
        const scores = Object.fromEntries(
          criteriaItems.map((item) => {
            const k = item.itemKey
            const v = scoreOf(item, e.def.bias, attended)
            if (v !== null && profile.divergent && ei === 0 && (k === 'DEC-01' || k === 'DUE-02')) {
              return [k, clampScore(v + 2)]
            }
            return [k, v]
          }),
        )
        submitted.push(scores)
        assessments.push(makeAssessment(cycle, profile.player.id, e.coach.id, scores, 'submitted'))
      })

      const agg = aggregateAssessments(criteria, submitted, cycle.minEvaluatorCount)
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

      // 確定後に編成を見直す。基本は推奨どおり、一部はコーチ協議で調整する
      if (LEAVERS[profile.index] === t) continue
      const recommended = agg.recommendedTeam
      const previous = currentTeam.get(profile.player.id) ?? null
      let assigned: Team | null = recommended ?? previous
      let reason = recommended ? '' : '評価者数不足のため前回の所属を継続'
      if (recommended && rand() < 0.07) {
        assigned = recommended === 'A' ? 'B' : recommended === 'C' ? 'B' : pick<Team>(['A', 'C'])
        reason = pick(OVERRIDE_REASONS)
      }
      if (assigned === previous) continue
      const effectiveDate = addDays(def.end, 9)
      const id = nextId('ta')
      teamAssignments.push({
        id,
        cycleId: cycle.id,
        playerId: profile.player.id,
        recommendedTeam: recommended,
        assignedTeam: assigned,
        reason: assigned === recommended ? '' : reason,
        effectiveDate,
        assignedBy: 'coach-01',
        createdAt: iso(effectiveDate, 10),
      })
      log('coach-01', 'teams.assign', 'teamAssignment', id, iso(effectiveDate, 10))
      currentTeam.set(profile.player.id, assigned)
    }
  })

  const criteriaList = [criteriaV1, criteriaV2, criteriaV3]
  const tables: Record<string, Row[]> = {
    [TABLES.groups.name]: groups.map((g) => encodeRow(TABLES.groups, g)),
    [TABLES.coaches.name]: coaches.map((c) => encodeRow(TABLES.coaches, c)),
    [TABLES.coachGroups.name]: coachGroups.map((c) => encodeRow(TABLES.coachGroups, c)),
    [TABLES.players.name]: players.map((p) => encodeRow(TABLES.players, p)),
    [TABLES.criteriaVersions.name]: criteriaList.map((c) =>
      encodeRow(TABLES.criteriaVersions, c.version),
    ),
    [TABLES.criteriaCategories.name]: criteriaList.flatMap((c) =>
      c.categories.map(({ items: _items, ...cat }) => encodeRow(TABLES.criteriaCategories, cat)),
    ),
    [TABLES.criteriaItems.name]: criteriaList.flatMap((c) =>
      c.categories.flatMap((cat) => cat.items.map((i) => encodeRow(TABLES.criteriaItems, i))),
    ),
    [TABLES.cycles.name]: cycles.map((c) => encodeRow(TABLES.cycles, c)),
    [TABLES.cyclePlayers.name]: cyclePlayers.map((c) => encodeRow(TABLES.cyclePlayers, c)),
    [TABLES.assessments.name]: assessments.map((a) => encodeRow(TABLES.assessments, a)),
    [TABLES.results.name]: results.map((r) => encodeRow(TABLES.results, r)),
    [TABLES.teamAssignments.name]: teamAssignments.map((t) => encodeRow(TABLES.teamAssignments, t)),
    [TABLES.auditLogs.name]: auditLogs.map((l) => encodeRow(TABLES.auditLogs, l)),
    [TABLES.appSettings.name]: [
      encodeRow(TABLES.appSettings, {
        id: 'defaultCriteriaVersionId',
        value: 'criteria-v3',
        updatedAt: created,
        updatedBy: 'coach-01',
      }),
    ],
  }

  const active = players.filter((p) => p.status === 'active').length
  const summary = [
    `選手 ${players.length}名（在籍 ${active}・退団 ${players.length - active}・途中入団 ${Object.keys(JOINERS).length}）`,
    `ダミーコーチ ${DEMO_COACHES.length}名（管理者2・コーチ8〈うち退任1〉・閲覧者2）${options.realAdmin ? `＋実在の管理者 ${options.realAdmin.email}` : ''}`,
    `評価期間 ${cycles.length}回（確定 ${cycles.length - 1}・実施中 1）`,
    `評価 ${assessments.length}件・確定結果 ${results.length}件・編成履歴 ${teamAssignments.length}件`,
  ]
  return { tables, summary }
}
