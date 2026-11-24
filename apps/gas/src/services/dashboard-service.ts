import { roundScore, type ApiPayload, type DashboardData, type Team } from '@kyonan/shared'
import { canAccessGroup, canEvaluate, type Ctx } from '../auth/authorization'
import { cyclePlayerIds, toCycleListItem } from './cycle-service'
import {
  average,
  compareCycles,
  criteriaMap,
  currentTeams,
  finalizedResultsByPlayer,
  isCompatibleWith,
  scoreDiff,
  visiblePlayers,
} from './queries'

export function getDashboard(ctx: Ctx, p: ApiPayload<'dashboard.get'>): DashboardData {
  const { db, actor } = ctx
  const players = visiblePlayers(db, actor, p.groupId)
  const active = players.filter((pl) => pl.status === 'active')
  const teams = currentTeams(db)
  const history = finalizedResultsByPlayer(db)
  const criteria = criteriaMap(db)

  const teamCounts: DashboardData['teamCounts'] = { A: 0, B: 0, C: 0, unassigned: 0 }
  for (const pl of active) teamCounts[teams.get(pl.id) ?? 'unassigned']++

  const latestOf = (id: string) => {
    const list = history.get(id) ?? []
    return { latest: list[list.length - 1], prev: list[list.length - 2] }
  }
  const latestTotals = active
    .map((pl) => latestOf(pl.id).latest?.result.totalScore)
    .filter((v): v is number => typeof v === 'number')
  const latestAvg = average(latestTotals)

  const cycles = db.cycles.filter(
    (c) => canAccessGroup(actor, c.groupId) && (p.groupId === undefined || c.groupId === p.groupId),
  )
  const finalized = cycles.filter((c) => c.status === 'finalized').sort(compareCycles)
  const open = cycles.filter((c) => c.status === 'open')

  const pendingForMe: DashboardData['pendingForMe'] = []
  if (canEvaluate(actor)) {
    for (const cycle of open) {
      const done = new Set(
        db.assessments
          .filter(
            (a) =>
              a.cycleId === cycle.id &&
              a.evaluatorId === actor.coach.id &&
              a.status === 'submitted',
          )
          .map((a) => a.playerId),
      )
      for (const id of cyclePlayerIds(db, cycle)) {
        const player = db.players.find(id)
        if (player && !done.has(id))
          pendingForMe.push({ cycleId: cycle.id, cycleName: cycle.name, player })
      }
    }
  }

  // カテゴリ別平均：最新の確定評価期間の評価基準と互換な各選手の最新結果を対象とする
  const latestCycle = finalized[finalized.length - 1]
  const refCriteria = latestCycle ? criteria.get(latestCycle.criteriaVersionId) : undefined
  const categoryAverages: DashboardData['categoryAverages'] = []
  if (refCriteria) {
    const compatible = active
      .map((pl) => latestOf(pl.id).latest?.result)
      .filter(
        (r) =>
          r !== undefined &&
          r.evaluatorCount > 0 &&
          isCompatibleWith(criteria, r.criteriaVersionId, refCriteria),
      )
    for (const cat of refCriteria.categories) {
      const avg = average(
        compatible
          .map((r) => r!.categoryScores[cat.categoryKey])
          .filter((v): v is number => typeof v === 'number'),
      )
      if (avg !== null) {
        categoryAverages.push({
          categoryKey: cat.categoryKey,
          name: cat.name,
          weight: cat.weight,
          average: avg,
        })
      }
    }
  }

  const scoreTrend: DashboardData['scoreTrend'] = []
  const teamTrend: DashboardData['teamTrend'] = []
  const today = ctx.runtime.now().toISOString().slice(0, 10)
  finalized.forEach((cycle, i) => {
    const totals = db.results
      .filter((r) => r.cycleId === cycle.id && r.status === 'complete' && r.totalScore !== null)
      .map((r) => r.totalScore as number)
    const avg = average(totals)
    if (avg !== null) {
      scoreTrend.push({
        cycleId: cycle.id,
        cycleName: cycle.name,
        date: cycle.endDate,
        average: roundScore(avg),
      })
    }
    // 各評価期間後に適用されていた編成（次の評価期間の開始前日、最新は本日時点）
    const asOf = finalized[i + 1]?.startDate ?? today
    const snapshot = currentTeams(db, asOf)
    const counts: Record<Team, number> = { A: 0, B: 0, C: 0 }
    for (const pl of players) {
      const t = snapshot.get(pl.id)
      if (t) counts[t]++
    }
    teamTrend.push({ cycleId: cycle.id, cycleName: cycle.name, date: cycle.endDate, ...counts })
  })

  const diffs = active
    .map((player) => {
      const { latest, prev } = latestOf(player.id)
      return { player, diff: scoreDiff(latest?.result, prev?.result, criteria) }
    })
    .filter((d): d is { player: (typeof active)[number]; diff: number } => d.diff !== null)

  return {
    activePlayerCount: active.length,
    teamCounts,
    latestAverageScore: latestAvg === null ? null : roundScore(latestAvg),
    openCycles: open.map((c) => toCycleListItem(db, c)),
    pendingForMe: pendingForMe.slice(0, 30),
    recentFinalized: finalized
      .slice(-5)
      .reverse()
      .map((c) => toCycleListItem(db, c)),
    categoryAverages,
    scoreTrend,
    teamTrend,
    growth: {
      improved: diffs.filter((d) => d.diff > 0).length,
      declined: diffs.filter((d) => d.diff < 0).length,
      unchanged: diffs.filter((d) => d.diff === 0).length,
      topImprovers: diffs
        .filter((d) => d.diff > 0)
        .sort((a, b) => b.diff - a.diff)
        .slice(0, 5),
    },
  }
}
