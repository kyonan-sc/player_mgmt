import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hmacSha256Hex } from '../infrastructure/hmac'
import { createTestApi, EMAILS, GROUP, scoresOf } from '../test-utils'
import { constantTimeEquals } from './guest-auth'

const PASSWORD = 'stg-guest-pass-2026'
const staging = { appEnv: 'staging', guestPassword: PASSWORD }

const errorCode = (res: { success: boolean; error?: { code: string } }) =>
  res.success ? 'OK' : res.error!.code

function login(t: ReturnType<typeof createTestApi>, password = PASSWORD) {
  const res = t.call(null, 'auth.guestLogin', { password })
  return res.success ? res.data : null
}

describe('HMAC-SHA256（純 JS 実装）', () => {
  it.each([
    ['key', 'The quick brown fox jumps over the lazy dog'],
    ['', ''],
    ['日本語のキー', 'guest.1790000000'],
    ['k'.repeat(100), 'x'.repeat(200)],
  ])('Node の crypto と一致する（key=%s）', (key, message) => {
    expect(hmacSha256Hex(key, message)).toBe(
      createHmac('sha256', key).update(message).digest('hex'),
    )
  })

  it('定数時間比較は長さの違いも不一致とする', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true)
    expect(constantTimeEquals('abc', 'abd')).toBe(false)
    expect(constantTimeEquals('abc', 'abcd')).toBe(false)
  })
})

const scoresPayload = (cycleId: string, expectedRevision: number | null = null) => ({
  cycleId,
  playerId: 'p1',
  scores: scoresOf(4),
  strengths: 'ゲストの入力',
  improvementPoints: '',
  comment: '',
  expectedRevision,
})

function openCycle(t: ReturnType<typeof createTestApi>) {
  const cycle = t.ok(EMAILS.admin, 'cycles.create', {
    groupId: GROUP,
    name: '検証評価',
    startDate: '2026-06-01',
    endDate: '2026-06-14',
    criteriaVersionId: 'cv1',
    minEvaluatorCount: 1,
  })
  t.ok(EMAILS.admin, 'cycles.open', { id: cycle.id })
  return cycle.id
}

describe('パスワード入場（ゲスト・コーチ）', () => {
  it('正しいパスワードで入場でき、コーチ権限で動作する', () => {
    const t = createTestApi({ config: staging })
    const session = login(t)!
    expect(session.token).toMatch(/^guest\.\d+\.[0-9a-f]{64}$/)
    expect(session.expiresAt).toBeGreaterThan(Date.parse('2026-06-01T00:00:00Z'))

    expect(t.ok(session.token, 'auth.me')).toMatchObject({
      role: 'coach',
      id: 'guest-coach',
      displayName: 'ゲスト（コーチ）',
    })
    // 全学年を閲覧でき、コーチコメントも閲覧できる（担当外グループの選手も含む）
    expect(t.ok(session.token, 'players.list', {})).toHaveLength(3)
    expect(t.ok(session.token, 'dashboard.get', {})).toBeTruthy()
    expect(t.ok(session.token, 'assessments.getHistory', { playerId: 'p1' })).toEqual([])
  })

  it('評価の下書き保存・提出ができ、評価者は「ゲスト（コーチ）」として記録される', () => {
    const t = createTestApi({ config: staging })
    const cycleId = openCycle(t)
    const { token } = login(t)!

    const draft = t.ok(token, 'assessments.save', scoresPayload(cycleId))
    expect(draft).toMatchObject({ status: 'draft', evaluatorId: 'guest-coach', revision: 1 })
    const submitted = t.ok(token, 'assessments.submit', scoresPayload(cycleId, 1))
    expect(submitted).toMatchObject({ status: 'submitted', revision: 2 })

    // 評価期間の進捗に反映され、確定後の履歴には評価者名が表示される
    const overview = t.ok(token, 'assessments.list', { cycleId })
    expect(overview.summary.mySubmitted).toBe(1)
    t.ok(EMAILS.admin, 'cycles.finalize', { id: cycleId, acknowledgeInsufficient: true })
    const history = t.ok(token, 'assessments.getHistory', { playerId: 'p1' })
    expect(history.map((h) => h.evaluatorName)).toEqual(['ゲスト（コーチ）'])
    const audit = t.ok(EMAILS.admin, 'audit.list', { limit: 50 })
    expect(audit.find((l) => l.action === 'assessments.submit')?.actorName).toBe('ゲスト（コーチ）')
  })

  it('管理操作（登録・編集・評価期間・編成・設定・コーチ管理など）は拒否される', () => {
    const t = createTestApi({ config: staging })
    const cycleId = openCycle(t)
    const { token } = login(t)!
    const player = {
      displayName: '不正登録',
      jerseyNumber: 99,
      enrollmentGrade: 3,
      enrollmentYear: 2026,
      groupId: GROUP,
      joinedDate: null,
      status: 'active',
    }
    const denied = [
      ['players.create', player],
      ['players.archive', { id: 'p1' }],
      [
        'cycles.create',
        {
          groupId: GROUP,
          name: 'x',
          startDate: '2026-07-01',
          endDate: '2026-07-02',
          criteriaVersionId: 'cv1',
        },
      ],
      ['cycles.finalize', { id: cycleId }],
      [
        'teams.assign',
        { playerId: 'p1', assignedTeam: 'A', reason: 'x', effectiveDate: '2026-06-01' },
      ],
      ['groups.create', { name: '5年生', cohortYear: 2016, status: 'active' }],
      [
        'settings.update',
        {
          teamName: 'x',
          defaultMinEvaluatorCount: 2,
          defaultCriteriaVersionId: null,
          progressWarningRate: 0.8,
        },
      ],
      ['coaches.list', {}],
      ['audit.list', { limit: 10 }],
    ] as const
    for (const [action, payload] of denied) {
      expect(errorCode(t.call(token, action, payload as never))).toBe('FORBIDDEN')
    }
    // データは変更されていない
    expect(t.api.store.readAll('players')).toHaveLength(3)
    expect(t.api.store.readAll('coaches')).toHaveLength(6)
    expect(t.api.store.readAll('assessment_cycles')).toHaveLength(1)
    expect(t.api.store.readAll('team_assignments')).toHaveLength(0)
  })

  it('確定済みの評価期間への入力は拒否される（通常のコーチと同じ）', () => {
    const t = createTestApi({ config: staging })
    const cycleId = openCycle(t)
    t.ok(EMAILS.admin, 'cycles.finalize', { id: cycleId, acknowledgeInsufficient: true })
    const { token } = login(t)!
    expect(errorCode(t.call(token, 'assessments.save', scoresPayload(cycleId)))).toBe('CONFLICT')
  })

  it('誤ったパスワードは拒否し、失敗が続くと正しいパスワードでも一時的に受け付けない', () => {
    const t = createTestApi({ config: staging })
    expect(errorCode(t.call(null, 'auth.guestLogin', { password: 'wrong-password' }))).toBe(
      'UNAUTHENTICATED',
    )
    for (let i = 0; i < 9; i++) t.call(null, 'auth.guestLogin', { password: `wrong-${i}` })
    expect(errorCode(t.call(null, 'auth.guestLogin', { password: PASSWORD }))).toBe('RATE_LIMITED')
    // 待機時間（10分）が過ぎれば再び入場できる
    t.advance(11 * 60 * 1000)
    expect(login(t)).not.toBeNull()
  })

  it('本番環境（APP_ENV=production）では、パスワードが設定されていても入場できない', () => {
    const t = createTestApi({ config: { appEnv: 'production', guestPassword: PASSWORD } })
    expect(errorCode(t.call(null, 'auth.guestLogin', { password: PASSWORD }))).toBe('FORBIDDEN')
  })

  it('パスワード未設定・短すぎる場合は無効', () => {
    for (const guestPassword of [null, '', 'short']) {
      const t = createTestApi({ config: { appEnv: 'staging', guestPassword } })
      expect(errorCode(t.call(null, 'auth.guestLogin', { password: 'short' }))).toBe('FORBIDDEN')
    }
  })

  it('ステージングで発行したトークンは、本番設定のバックエンドでは通らない', () => {
    const staged = createTestApi({ config: staging })
    const { token } = login(staged)!
    const prod = createTestApi({ config: { appEnv: 'production', guestPassword: PASSWORD } })
    expect(errorCode(prod.call(token, 'players.list', {}))).toBe('UNAUTHENTICATED')
  })

  it('有効期限切れ・改ざん・別のパスワードで署名されたトークンを拒否する', () => {
    const t = createTestApi({ config: staging })
    const { token } = login(t)!
    const [prefix, expiry, signature] = token.split('.')

    const extended = `${prefix}.${Number(expiry) + 99999}.${signature}`
    expect(errorCode(t.call(extended, 'auth.me'))).toBe('UNAUTHENTICATED')
    expect(errorCode(t.call(`${token}0`, 'auth.me'))).toBe('UNAUTHENTICATED')
    expect(errorCode(t.call('guest.1.2', 'auth.me'))).toBe('UNAUTHENTICATED')

    const other = createTestApi({
      config: { appEnv: 'staging', guestPassword: 'another-password-99' },
    })
    expect(errorCode(other.call(token, 'auth.me'))).toBe('UNAUTHENTICATED')

    t.advance(4 * 60 * 60 * 1000 + 5000)
    expect(errorCode(t.call(token, 'auth.me'))).toBe('UNAUTHENTICATED')
  })

  it('ゲストは通常のログイン（Google 相当）の仕組みや登録コーチに影響しない', () => {
    const t = createTestApi({ config: staging })
    const { token } = login(t)!
    t.ok(token, 'players.list', {})
    expect(
      t.api.store.readAll('coaches').every((c) => c.googleSub === '' || c.googleSub === null),
    ).toBe(true)
    expect(t.api.store.readAll('coaches')).toHaveLength(6)
  })
})
