import { describe, expect, it } from 'vitest'
import { createMockApi } from '../core'
import { assertStagingEnv } from '../entrypoints/demo-seed'
import { buildStagingDemoDataset } from './demo-dataset'

const OWNER = 'owner@example.com'

function setup() {
  const { tables } = buildStagingDemoDataset({ realAdmin: { email: OWNER, googleSub: null } })
  const api = createMockApi(tables, { now: () => new Date('2026-11-24T03:00:00Z') })
  let n = 0
  const ok = (as: string, action: string, payload: unknown = {}) => {
    const res = api.handle(
      JSON.stringify({ action, requestId: `req-${++n}-demo`, idToken: `mock:${as}`, payload }),
    )
    if (!res.success) throw new Error(`${action}: ${res.error.code} ${res.error.message}`)
    return res.data as never
  }
  return { tables, ok }
}

describe('検証用ダミーデータ（約1年分）', () => {
  it('選手35名・ダミーコーチ12名＋実在の管理者を含み、実在の管理者でログインできる', () => {
    const { tables, ok } = setup()
    expect(tables.players).toHaveLength(35)
    expect(tables.coaches).toHaveLength(13)
    expect(ok(OWNER, 'auth.me')).toMatchObject({ role: 'admin' })
    const players: { player: { status: string } }[] = ok(OWNER, 'players.list', { status: 'all' })
    expect(players).toHaveLength(35)
    expect(players.filter((p) => p.player.status === 'inactive')).toHaveLength(2)
  })

  it('約1年分の評価期間（確定9回＋実施中1回）が API から整合した状態で読める', () => {
    const { ok } = setup()
    const cycles: { cycle: { status: string; startDate: string } }[] = ok(OWNER, 'cycles.list')
    expect(cycles).toHaveLength(10)
    expect(cycles.filter((c) => c.cycle.status === 'open')).toHaveLength(1)
    expect(cycles.map((c) => c.cycle.startDate).sort()[0]).toBe('2025-12-01')

    const dashboard: { scoreTrend: unknown[]; teamCounts: Record<'A' | 'B' | 'C', number> } = ok(
      OWNER,
      'dashboard.get',
    )
    expect(dashboard.scoreTrend).toHaveLength(9)
    expect(
      dashboard.teamCounts.A + dashboard.teamCounts.B + dashboard.teamCounts.C,
    ).toBeGreaterThan(25)

    const results: { rows: { result: { status: string } }[] } = ok(OWNER, 'results.list', {
      cycleId: 'cycle-09',
    })
    expect(results.rows.length).toBeGreaterThan(25)
    // 1年間で評価者数不足（未判定）の選手が一定数発生している
    const { tables } = setup()
    const insufficient = tables.assessment_results!.filter(
      (r) => r.status === 'insufficient',
    ).length
    expect(insufficient).toBeGreaterThan(5)
  })

  it('途中入団の選手は入団後の評価期間のみ評価対象になる', () => {
    const { tables } = setup()
    const cyclesOf = (playerId: string) =>
      tables.cycle_players!.filter((cp) => cp.playerId === playerId).map((cp) => cp.cycleId)
    expect(cyclesOf('player-35')).toEqual(['cycle-09', 'cycle-10'])
    expect(cyclesOf('player-09')).toEqual(['cycle-01', 'cycle-02', 'cycle-03', 'cycle-04'])
    const targets = new Set(tables.cycle_players!.map((cp) => `${cp.cycleId}:${cp.playerId}`))
    expect(tables.assessments!.every((a) => targets.has(`${a.cycleId}:${a.playerId}`))).toBe(true)
  })

  it('ダミーコーチのコーチ権限で、実施中の評価期間に評価を入力できる', () => {
    const { ok } = setup()
    const overview: { players: { player: { id: string }; myStatus: string }[] } = ok(
      'tanaka@staging.kyonan-sc.example',
      'assessments.list',
      { cycleId: 'cycle-10' },
    )
    expect(overview.players.length).toBe(33)
  })

  it('評価基準は v1〜v4 の履歴を持ち、実施中の最新期間だけが「シュート」を含む標準基準（v4）を使う', () => {
    const { tables } = setup()
    const itemKeysOf = (versionId: string) => {
      const categoryIds = new Set(
        tables.criteria_categories!.filter((c) => c.versionId === versionId).map((c) => c.id),
      )
      return tables
        .criteria_items!.filter((i) => categoryIds.has(i.categoryId as string))
        .map((i) => i.itemKey)
    }
    expect(tables.criteria_versions!.map((v) => v.version)).toEqual(['v1', 'v2', 'v3', 'v4'])
    expect(itemKeysOf('criteria-v3')).not.toContain('TEC-04')
    expect(itemKeysOf('criteria-v4')).toContain('TEC-04')
    expect(itemKeysOf('criteria-v4')).toHaveLength(14)

    const cycle10 = tables.assessment_cycles!.find((c) => c.id === 'cycle-10')!
    expect(cycle10.criteriaVersionId).toBe('criteria-v4')
    const mine = tables.assessments!.filter(
      (a) => a.cycleId === 'cycle-10' && a.status === 'submitted',
    )
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((a) => JSON.parse(a.scoresJson as string)['TEC-04'] !== undefined)).toBe(true)
  })

  it('APP_ENV が staging 以外では実行を拒否する', () => {
    expect(() => assertStagingEnv('production')).toThrow(/staging/)
    expect(() => assertStagingEnv('staging')).not.toThrow()
  })
})
