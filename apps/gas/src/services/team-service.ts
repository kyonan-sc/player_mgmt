import type { ApiPayload, TeamAssignment, TeamBoard } from '@kyonan/shared'
import { invalid } from '../api/errors'
import { audit, nowIso, requireAdmin, type Ctx } from '../auth/authorization'
import { requireGroupOfPlayer } from './assessment-service'
import {
  compareAssignments,
  criteriaMap,
  currentTeams,
  finalizedResultsByPlayer,
  scoreDiff,
  visiblePlayers,
} from './queries'

export function listTeams(ctx: Ctx, p: ApiPayload<'teams.list'>): TeamBoard {
  const { db, actor } = ctx
  const players = visiblePlayers(db, actor, p.groupId).filter((pl) => pl.status === 'active')
  const ids = new Set(players.map((pl) => pl.id))
  const history = finalizedResultsByPlayer(db)
  const teams = currentTeams(db)
  const criteria = criteriaMap(db)
  return {
    players: players
      .map((player) => {
        const list = history.get(player.id) ?? []
        const latest = list[list.length - 1]
        const prev = list[list.length - 2]
        return {
          player,
          currentTeam: teams.get(player.id) ?? null,
          recommendedTeam: latest?.result.recommendedTeam ?? null,
          latestCycleId: latest?.cycle.id ?? null,
          totalScore: latest?.result.totalScore ?? null,
          diff: scoreDiff(latest?.result, prev?.result, criteria),
        }
      })
      .sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1)),
    history: db.teamAssignments
      .filter((a) => ids.has(a.playerId))
      .sort((a, b) => compareAssignments(b, a)),
  }
}

/** チーム編成の変更。既存レコードは上書きせず履歴として追加する。 */
export function assignTeam(ctx: Ctx, p: ApiPayload<'teams.assign'>): TeamAssignment {
  requireAdmin(ctx.actor)
  requireGroupOfPlayer(ctx, p.playerId)
  const list = finalizedResultsByPlayer(ctx.db).get(p.playerId) ?? []
  const latest = list[list.length - 1]
  const recommendedTeam = latest?.result.recommendedTeam ?? null
  if (p.assignedTeam !== recommendedTeam && p.reason.trim() === '') {
    throw invalid('推奨チームと異なるチームを設定する場合は理由を入力してください', [
      { path: 'reason', message: '理由を入力してください' },
    ])
  }
  const assignment: TeamAssignment = {
    id: ctx.runtime.uuid(),
    cycleId: latest?.cycle.id ?? null,
    playerId: p.playerId,
    recommendedTeam,
    assignedTeam: p.assignedTeam,
    reason: p.reason.trim(),
    effectiveDate: p.effectiveDate,
    assignedBy: ctx.actor.coach.id,
    createdAt: nowIso(ctx),
  }
  ctx.db.teamAssignments.insert(assignment)
  audit(ctx, 'teamAssignment', assignment.id)
  return assignment
}
