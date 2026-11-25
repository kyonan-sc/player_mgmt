import { buildStandardCriteria } from '@kyonan/shared'
import { describe, expect, it } from 'vitest'
import { EMAILS, GROUP, createTestApi, scoresOf } from '../test-utils'

const errorCode = (res: { success: boolean; error?: { code: string } }) =>
  res.success ? 'OK' : res.error!.code

function openCycle(t: ReturnType<typeof createTestApi>, minEvaluatorCount = 2) {
  const cycle = t.ok(EMAILS.admin, 'cycles.create', {
    groupId: GROUP,
    name: '2026年6月評価',
    startDate: '2026-06-01',
    endDate: '2026-06-14',
    criteriaVersionId: 'cv1',
    minEvaluatorCount,
  })
  t.ok(EMAILS.admin, 'cycles.open', { id: cycle.id })
  return cycle.id
}

const draft = (
  cycleId: string,
  playerId: string,
  score: number | null,
  expectedRevision: number | null = null,
) => ({
  cycleId,
  playerId,
  scores: scoresOf(score),
  strengths: '',
  improvementPoints: '',
  comment: '',
  expectedRevision,
})

describe('認証・リクエスト検証', () => {
  it('health.check は認証不要', () => {
    const t = createTestApi()
    expect(t.call(null, 'health.check').success).toBe(true)
  })

  it('トークンなしは UNAUTHENTICATED、未登録アカウントと無効化アカウントは FORBIDDEN', () => {
    const t = createTestApi()
    expect(errorCode(t.call(null, 'auth.me'))).toBe('UNAUTHENTICATED')
    expect(errorCode(t.call('stranger@example.com', 'auth.me'))).toBe('FORBIDDEN')
    expect(errorCode(t.call(EMAILS.inactive, 'auth.me'))).toBe('FORBIDDEN')
  })

  it('初回ログインで sub を紐付け、操作履歴に記録する', () => {
    const t = createTestApi()
    expect(t.ok(EMAILS.coach, 'auth.me')).toMatchObject({
      id: 'c-coach',
      role: 'coach',
      groupIds: [GROUP],
    })
    const coach = t.api.store.readAll('coaches').find((c) => c.id === 'c-coach')
    expect(coach?.googleSub).toBe(`mock-sub-${EMAILS.coach}`)
    expect(t.api.store.readAll('audit_logs').some((l) => l.action === 'auth.linkAccount')).toBe(
      true,
    )
  })

  it('有効な管理者がいない場合のみ BOOTSTRAP_ADMIN_EMAIL を管理者として登録する', () => {
    const t = createTestApi({ bootstrapAdminEmail: 'owner@example.com', fixture: { coaches: [] } })
    expect(t.ok('owner@example.com', 'auth.me').role).toBe('admin')
    const t2 = createTestApi({ bootstrapAdminEmail: 'owner@example.com' })
    expect(errorCode(t2.call('owner@example.com', 'auth.me'))).toBe('FORBIDDEN')
  })

  it('不正な payload・不明な action は VALIDATION_ERROR（詳細を返す）', () => {
    const t = createTestApi()
    const res = t.call(EMAILS.admin, 'players.create', { displayName: '' } as never)
    expect(errorCode(res)).toBe('VALIDATION_ERROR')
    expect(!res.success && res.error.details?.length).toBeGreaterThan(0)
    expect(errorCode(t.call(EMAILS.admin, 'unknown.action' as never))).toBe('VALIDATION_ERROR')
  })
})

describe('認可', () => {
  it('選手登録は管理者のみ', () => {
    const t = createTestApi()
    const input = {
      displayName: '新入団',
      jerseyNumber: 10,
      enrollmentGrade: 3,
      enrollmentYear: 2026,
      groupId: GROUP,
      joinedDate: null,
      status: 'active' as const,
    }
    expect(errorCode(t.call(EMAILS.coach, 'players.create', input))).toBe('FORBIDDEN')
    expect(t.ok(EMAILS.admin, 'players.create', input).displayName).toBe('新入団')
  })

  it('担当外グループの選手は一覧に出ず、詳細取得は FORBIDDEN', () => {
    const t = createTestApi()
    expect(t.ok(EMAILS.coach, 'players.list', {}).map((p) => p.player.id)).toEqual(['p1', 'p2'])
    expect(errorCode(t.call(EMAILS.coach, 'players.get', { id: 'p3' }))).toBe('FORBIDDEN')
    expect(t.ok(EMAILS.admin, 'players.list', {})).toHaveLength(3)
  })

  it('viewer は評価入力・評価状況・コメントを閲覧できない', () => {
    const t = createTestApi()
    const cycleId = openCycle(t)
    expect(errorCode(t.call(EMAILS.viewer, 'assessments.save', draft(cycleId, 'p1', 3)))).toBe(
      'FORBIDDEN',
    )
    expect(errorCode(t.call(EMAILS.viewer, 'assessments.list', { cycleId }))).toBe('FORBIDDEN')
    expect(errorCode(t.call(EMAILS.viewer, 'assessments.getHistory', { playerId: 'p1' }))).toBe(
      'FORBIDDEN',
    )
    expect(t.ok(EMAILS.viewer, 'cycles.list', {})).toHaveLength(0)
  })

  it('最後の有効な管理者は無効化・降格できない', () => {
    const t = createTestApi()
    const res = t.call(EMAILS.admin, 'coaches.update', {
      id: 'c-admin',
      email: EMAILS.admin,
      displayName: 'admin',
      role: 'coach',
      groupIds: [],
      status: 'active',
    })
    expect(errorCode(res)).toBe('CONFLICT')
  })
})

describe('評価フロー', () => {
  it('下書き → 提出 → 確定 → 集計結果', () => {
    const t = createTestApi()
    const cycleId = openCycle(t)

    const saved = t.ok(EMAILS.coach, 'assessments.save', {
      ...draft(cycleId, 'p1', 4),
      scores: { 'TEC-01': 4 },
    })
    expect(saved).toMatchObject({ status: 'draft', revision: 1 })
    expect(saved.scores['INV-02']).toBeNull()

    // 未入力項目があると提出できない
    const missing = t.call(EMAILS.coach, 'assessments.submit', {
      ...draft(cycleId, 'p1', 4, 1),
      scores: { 'TEC-01': 4 },
    })
    expect(errorCode(missing)).toBe('VALIDATION_ERROR')

    t.ok(EMAILS.coach, 'assessments.submit', draft(cycleId, 'p1', 4, 1))
    t.ok(EMAILS.coach2, 'assessments.submit', draft(cycleId, 'p1', 5))
    t.ok(EMAILS.coach, 'assessments.submit', draft(cycleId, 'p2', 3))

    // 確定前は一般コーチに結果を見せない。管理者は暫定集計を確認できる
    expect(errorCode(t.call(EMAILS.coach, 'results.list', { cycleId }))).toBe('FORBIDDEN')
    const preview = t.ok(EMAILS.admin, 'results.list', { cycleId })
    expect(preview.preview).toBe(true)

    // 評価不足の選手（p2）がいる場合は明示的な確認が必要
    expect(errorCode(t.call(EMAILS.admin, 'cycles.finalize', { id: cycleId }))).toBe(
      'VALIDATION_ERROR',
    )
    const finalized = t.ok(EMAILS.admin, 'cycles.finalize', {
      id: cycleId,
      acknowledgeInsufficient: true,
    })
    expect(finalized.status).toBe('finalized')

    const results = t.ok(EMAILS.coach, 'results.list', { cycleId })
    const p1 = results.rows.find((r) => r.player.id === 'p1')!
    const p2 = results.rows.find((r) => r.player.id === 'p2')!
    expect(p1.result).toMatchObject({
      totalScore: 90,
      recommendedTeam: 'A',
      status: 'complete',
      evaluatorCount: 2,
    })
    expect(p2.result).toMatchObject({
      totalScore: 60,
      recommendedTeam: null,
      status: 'insufficient',
    })

    // 確定後は変更不可・再確定は冪等
    expect(errorCode(t.call(EMAILS.coach, 'assessments.save', draft(cycleId, 'p1', 1, 2)))).toBe(
      'CONFLICT',
    )
    t.ok(EMAILS.admin, 'cycles.finalize', { id: cycleId })
    expect(t.api.store.readAll('assessment_results')).toHaveLength(2)

    // 確定後はコーチがコメント履歴を閲覧できる
    expect(t.ok(EMAILS.coach, 'assessments.getHistory', { playerId: 'p1' })).toHaveLength(2)
  })

  it('提出済み評価を下書き保存すると下書きに戻る。revision 不一致は CONFLICT', () => {
    const t = createTestApi()
    const cycleId = openCycle(t)
    t.ok(EMAILS.coach, 'assessments.submit', draft(cycleId, 'p1', 4))
    expect(t.ok(EMAILS.coach, 'assessments.save', draft(cycleId, 'p1', 3, 1)).status).toBe('draft')
    expect(errorCode(t.call(EMAILS.coach, 'assessments.save', draft(cycleId, 'p1', 3, 1)))).toBe(
      'CONFLICT',
    )
    expect(errorCode(t.call(EMAILS.coach, 'assessments.save', draft(cycleId, 'p1', 3, null)))).toBe(
      'CONFLICT',
    )
  })

  it('同じ requestId の再送は同じ結果を返し、重複登録しない', () => {
    const t = createTestApi()
    const payload = {
      groupId: GROUP,
      name: 'x',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      criteriaVersionId: 'cv1',
    }
    const a = t.call(EMAILS.admin, 'cycles.create', payload, 'same-request-id')
    const b = t.call(EMAILS.admin, 'cycles.create', payload, 'same-request-id')
    expect(b).toEqual(a)
    expect(t.api.store.readAll('assessment_cycles')).toHaveLength(1)
  })
})

describe('チーム編成・評価基準', () => {
  it('推奨と異なるチームには理由が必須。履歴は追加される', () => {
    const t = createTestApi()
    const cycleId = openCycle(t, 1)
    t.ok(EMAILS.coach, 'assessments.submit', draft(cycleId, 'p1', 3))
    t.ok(EMAILS.admin, 'cycles.finalize', { id: cycleId, acknowledgeInsufficient: true })

    const base = { playerId: 'p1', effectiveDate: '2026-06-20' }
    expect(errorCode(t.call(EMAILS.admin, 'teams.assign', { ...base, assignedTeam: 'A' }))).toBe(
      'VALIDATION_ERROR',
    )
    t.ok(EMAILS.admin, 'teams.assign', { ...base, assignedTeam: 'B' })
    t.ok(EMAILS.admin, 'teams.assign', { ...base, assignedTeam: 'A', reason: 'ポジションバランス' })
    const board = t.ok(EMAILS.coach, 'teams.list', {})
    expect(board.players.find((p) => p.player.id === 'p1')).toMatchObject({
      currentTeam: 'A',
      recommendedTeam: 'B',
    })
    expect(board.history).toHaveLength(2)
    expect(errorCode(t.call(EMAILS.coach, 'teams.assign', { ...base, assignedTeam: 'B' }))).toBe(
      'FORBIDDEN',
    )
  })

  it('配点合計が100点でない評価基準は作成できない', () => {
    const t = createTestApi()
    const res = t.call(EMAILS.admin, 'criteria.createVersion', {
      version: 'v2',
      name: 'test',
      thresholdA: 80,
      thresholdB: 60,
      categories: [
        {
          categoryKey: 'TEC',
          name: '技術',
          weight: 90,
          items: [
            {
              itemKey: 'T1',
              name: 'a',
              description: '',
              rubric: {},
              maxScore: 5 as const,
              allowUnobserved: false,
            },
          ],
        },
      ],
    })
    expect(errorCode(res)).toBe('VALIDATION_ERROR')
  })
})

describe('練習への取り組み（3段階）', () => {
  const standard = buildStandardCriteria('std')
  const ENG = ['ENG-01', 'ENG-02', 'ENG-03', 'ENG-04']
  /** 標準の基準（シュートを含む基本10項目）の入力 */
  const std = (v: number) => ({ ...scoresOf(v), 'TEC-04': v })
  const engScores = (values: (number | null)[]) =>
    Object.fromEntries(ENG.map((k, i) => [k, values[i] ?? null]))
  const payload = (
    cycleId: string,
    scores: Record<string, number | null>,
    rev: number | null = null,
  ) => ({
    cycleId,
    playerId: 'p1',
    scores,
    strengths: '',
    improvementPoints: '',
    comment: '',
    expectedRevision: rev,
  })

  /** 標準の評価基準（取り組みを含む）を API から作成し、評価期間を開始する */
  function setup() {
    const t = createTestApi()
    const created = t.ok(EMAILS.admin, 'criteria.createVersion', {
      version: 'v-std',
      name: '標準',
      thresholdA: 80,
      thresholdB: 60,
      categories: standard.categories.map((c) => ({
        categoryKey: c.categoryKey,
        name: c.name,
        weight: c.weight,
        items: c.items.map((i) => ({
          itemKey: i.itemKey,
          name: i.name,
          description: i.description,
          rubric: i.rubric,
          maxScore: i.maxScore as 3 | 5,
          allowUnobserved: i.allowUnobserved,
        })),
      })),
    })
    const cycle = t.ok(EMAILS.admin, 'cycles.create', {
      groupId: GROUP,
      name: '標準基準の評価',
      startDate: '2026-06-01',
      endDate: '2026-06-14',
      criteriaVersionId: created.version.id,
      minEvaluatorCount: 1,
    })
    t.ok(EMAILS.admin, 'cycles.open', { id: cycle.id })
    return { t, cycleId: cycle.id, created }
  }

  it('評価基準を作成すると、項目ごとの段階数が保存される', () => {
    const { created } = setup()
    const eng = created.categories.find((c) => c.categoryKey === 'ENG')!
    expect(created.categories.map((c) => c.weight)).toEqual([30, 20, 20, 20, 10])
    expect(created.categories[0]!.items.map((i) => i.itemKey)).toEqual([
      'TEC-01',
      'TEC-02',
      'TEC-03',
      'TEC-04',
    ])
    expect(eng.items.map((i) => [i.maxScore, i.allowUnobserved])).toEqual([
      [3, false],
      [3, false],
      [3, false],
      [3, false],
    ])
    expect(created.categories[0]!.items[0]).toMatchObject({ maxScore: 5, allowUnobserved: false })
  })

  it('全14項目（シュートを含む5段階10項目＋取り組み4項目）を入力すれば提出できる', () => {
    const { t, cycleId } = setup()
    const res = t.ok(
      EMAILS.coach,
      'assessments.submit',
      payload(cycleId, { ...std(4), ...engScores([3, 3, 3, 3]) }),
    )
    expect(res.status).toBe('submitted')
  })

  it('取り組みは3段階まで。4点以上は下書きでも拒否し、取り組みが欠けた提出も拒否する', () => {
    const { t, cycleId } = setup()
    const over = t.call(
      EMAILS.coach,
      'assessments.save',
      payload(cycleId, { ...std(4), ...engScores([4, 3, 3, 3]) }),
    )
    expect(errorCode(over)).toBe('VALIDATION_ERROR')
    const short = t.call(
      EMAILS.coach,
      'assessments.submit',
      payload(cycleId, { ...std(4), ...engScores([3, 3, 3]) }),
    )
    expect(errorCode(short)).toBe('VALIDATION_ERROR')
    expect(!short.success && short.error.message).toContain('必須の14項目')
  })

  it('確定すると、5段階と3段階の項目を配点どおりに合算した100点満点の結果になる', () => {
    const { t, cycleId } = setup()
    t.ok(
      EMAILS.coach,
      'assessments.submit',
      payload(cycleId, { ...std(4), ...engScores([3, 3, 1, 3]) }),
    )
    t.ok(
      EMAILS.coach2,
      'assessments.submit',
      payload(cycleId, { ...std(4), ...engScores([1, 3, 1, 3]) }),
    )
    t.ok(EMAILS.admin, 'cycles.finalize', { id: cycleId, acknowledgeInsufficient: true })

    const row = t
      .ok(EMAILS.coach, 'results.list', { cycleId })
      .rows.find((r) => r.player.id === 'p1')!
    expect(row.result.evaluatorCount).toBe(2)
    expect(row.result.itemScores['ENG-01']).toBe(2) // (3+1)/2
    expect(row.result.itemScores['ENG-03']).toBe(1)
    // 取り組み：(2 + 3 + 1 + 3) / 4 = 2.25 → 2.25/3 × 10 = 7.5点。基本4カテゴリは4/5 = 80%
    expect(row.result.categoryScores.ENG).toBeCloseTo(7.5)
    expect(row.result.categoryScores.TEC).toBeCloseTo(24)
    // 基本4カテゴリ（配点90点）の4/5 = 72点 ＋ 取り組み 7.5点 ＝ 79.5点
    expect(row.result.totalScore).toBe(79.5)
  })

  it('旧データ（段階数の列が空）は、5段階として扱う', () => {
    const t = createTestApi()
    const [category] = t.ok(EMAILS.admin, 'criteria.list')[0]!.categories
    expect(category!.items.every((i) => i.maxScore === 5 && !i.allowUnobserved)).toBe(true)
  })
})
