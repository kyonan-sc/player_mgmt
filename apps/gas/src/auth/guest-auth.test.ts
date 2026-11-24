import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hmacSha256Hex } from '../infrastructure/hmac'
import { createTestApi, GROUP, scoresOf } from '../test-utils'
import { constantTimeEquals } from './guest-auth'

const PASSWORD = 'stg-guest-pass-2026'
const staging = { appEnv: 'staging', guestViewerPassword: PASSWORD }

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

describe('パスワード入場（ゲスト・閲覧者）', () => {
  it('正しいパスワードで入場でき、読み取り専用の閲覧者として動作する', () => {
    const t = createTestApi({ config: staging })
    const session = login(t)!
    expect(session.token).toMatch(/^guest\.\d+\.[0-9a-f]{64}$/)
    expect(session.expiresAt).toBeGreaterThan(Date.parse('2026-06-01T00:00:00Z'))

    expect(t.ok(session.token, 'auth.me')).toMatchObject({ role: 'viewer', id: 'guest-viewer' })
    expect(t.ok(session.token, 'players.list', {}).length).toBeGreaterThan(0)
    expect(t.ok(session.token, 'dashboard.get', {})).toBeTruthy()
  })

  it('変更系 API は有効なペイロードでも拒否し、管理者専用の読み取りも拒否する', () => {
    const t = createTestApi({ config: staging })
    const { token } = login(t)!
    const mutations = [
      [
        'players.create',
        {
          displayName: '不正登録',
          jerseyNumber: 99,
          enrollmentGrade: 3,
          enrollmentYear: 2026,
          groupId: GROUP,
          joinedDate: null,
          status: 'active',
        },
      ],
      [
        'assessments.save',
        {
          cycleId: 'c',
          playerId: 'p1',
          scores: scoresOf(3),
          strengths: '',
          improvementPoints: '',
          comment: '',
          expectedRevision: null,
        },
      ],
      [
        'teams.assign',
        { playerId: 'p1', assignedTeam: 'A', reason: 'x', effectiveDate: '2026-06-01' },
      ],
    ] as const
    for (const [action, payload] of mutations) {
      expect(errorCode(t.call(token, action, payload as never))).toBe('FORBIDDEN')
    }
    expect(errorCode(t.call(token, 'coaches.list', {}))).toBe('FORBIDDEN')
    expect(errorCode(t.call(token, 'audit.list', { limit: 10 }))).toBe('FORBIDDEN')
    expect(errorCode(t.call(token, 'assessments.getHistory', { playerId: 'p1' }))).toBe('FORBIDDEN')
    // データは変更されていない
    expect(t.api.store.readAll('players')).toHaveLength(3)
    expect(t.api.store.readAll('audit_logs')).toHaveLength(0)
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
    const t = createTestApi({ config: { appEnv: 'production', guestViewerPassword: PASSWORD } })
    expect(errorCode(t.call(null, 'auth.guestLogin', { password: PASSWORD }))).toBe('FORBIDDEN')
  })

  it('パスワード未設定・短すぎる場合は無効', () => {
    for (const guestViewerPassword of [null, '', 'short']) {
      const t = createTestApi({ config: { appEnv: 'staging', guestViewerPassword } })
      expect(errorCode(t.call(null, 'auth.guestLogin', { password: 'short' }))).toBe('FORBIDDEN')
    }
  })

  it('ステージングで発行したトークンは、本番設定のバックエンドでは通らない', () => {
    const staged = createTestApi({ config: staging })
    const { token } = login(staged)!
    const prod = createTestApi({ config: { appEnv: 'production', guestViewerPassword: PASSWORD } })
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
      config: { appEnv: 'staging', guestViewerPassword: 'another-password-99' },
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
