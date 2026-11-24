import type { ApiPayload, Group, Player, PlayerDetail, PlayerListItem } from '@kyonan/shared'
import { conflict, invalid, notFound } from '../api/errors'
import {
  audit,
  canAccessGroup,
  nowIso,
  requireAdmin,
  requireGroupAccess,
  type Ctx,
} from '../auth/authorization'
import {
  average,
  compareAssignments,
  criteriaMap,
  currentTeams,
  finalizedResultsByPlayer,
  groupName,
  scoreDiff,
  toSummary,
  visiblePlayers,
} from './queries'

export function listPlayers(ctx: Ctx, p: ApiPayload<'players.list'>): PlayerListItem[] {
  const { db, actor } = ctx
  const history = finalizedResultsByPlayer(db)
  const teams = currentTeams(db)
  const criteria = criteriaMap(db)
  return visiblePlayers(db, actor, p.groupId)
    .filter((pl) => p.status === 'all' || pl.status === p.status)
    .map((player) => {
      const list = history.get(player.id) ?? []
      const latest = list[list.length - 1]
      const prev = list[list.length - 2]
      return {
        player,
        groupName: groupName(db, player.groupId),
        currentTeam: teams.get(player.id) ?? null,
        latest: latest ? toSummary(latest) : null,
        diff: scoreDiff(latest?.result, prev?.result, criteria),
      }
    })
    .sort((a, b) => (a.player.jerseyNumber ?? 9999) - (b.player.jerseyNumber ?? 9999))
}

export function getPlayer(ctx: Ctx, id: string): PlayerDetail {
  const { db, actor } = ctx
  const player = db.players.find(id)
  if (!player) throw notFound('選手')
  requireGroupAccess(actor, player.groupId)

  const allHistory = finalizedResultsByPlayer(db)
  const history = allHistory.get(id) ?? []
  const criteria = criteriaMap(db)
  const usedCriteria = Object.fromEntries(
    [...new Set(history.map((h) => h.result.criteriaVersionId))]
      .map((vid) => [vid, criteria.get(vid)] as const)
      .filter((e): e is [string, NonNullable<(typeof e)[1]>] => e[1] !== undefined),
  )

  let groupAverage: PlayerDetail['groupAverage'] = null
  const latest = history[history.length - 1]
  if (latest) {
    const sameCycle = db.results.filter(
      (r) => r.cycleId === latest.cycle.id && r.evaluatorCount > 0,
    )
    const keys = Object.keys(latest.result.categoryScores)
    const categoryScores: Record<string, number> = {}
    for (const key of keys) {
      const avg = average(
        sameCycle
          .map((r) => r.categoryScores[key])
          .filter((v): v is number => typeof v === 'number'),
      )
      if (avg !== null) categoryScores[key] = avg
    }
    groupAverage = { cycleId: latest.cycle.id, categoryScores }
  }

  return {
    player,
    group: db.groups.find(player.groupId) ?? null,
    currentTeam: currentTeams(db).get(id) ?? null,
    results: history.map(toSummary),
    criteria: usedCriteria,
    groupAverage,
    teamHistory: db.teamAssignments.filter((a) => a.playerId === id).sort(compareAssignments),
  }
}

function assertGroupExists(ctx: Ctx, groupId: string): Group {
  const group = ctx.db.groups.find(groupId)
  if (!group)
    throw invalid('所属学年グループが存在しません', [
      { path: 'groupId', message: '選択してください' },
    ])
  return group
}

export function createPlayer(ctx: Ctx, input: ApiPayload<'players.create'>): Player {
  requireAdmin(ctx.actor)
  assertGroupExists(ctx, input.groupId)
  const now = nowIso(ctx)
  const player: Player = { id: ctx.runtime.uuid(), ...input, createdAt: now, updatedAt: now }
  ctx.db.players.insert(player)
  audit(ctx, 'player', player.id)
  return player
}

export function updatePlayer(ctx: Ctx, input: ApiPayload<'players.update'>): Player {
  requireAdmin(ctx.actor)
  const current = ctx.db.players.find(input.id)
  if (!current) throw notFound('選手')
  if (current.updatedAt !== input.expectedUpdatedAt) {
    throw conflict('他のユーザーが先に更新しました。最新の情報を読み込み直してください。')
  }
  assertGroupExists(ctx, input.groupId)
  const { expectedUpdatedAt: _ignored, ...fields } = input
  const player: Player = { ...current, ...fields, updatedAt: nowIso(ctx) }
  ctx.db.players.update(player)
  audit(ctx, 'player', player.id)
  return player
}

export function archivePlayer(ctx: Ctx, id: string): Player {
  requireAdmin(ctx.actor)
  const current = ctx.db.players.find(id)
  if (!current) throw notFound('選手')
  if (current.status === 'inactive') return current
  const player: Player = { ...current, status: 'inactive', updatedAt: nowIso(ctx) }
  ctx.db.players.update(player)
  audit(ctx, 'player', id)
  return player
}

export function listGroups(ctx: Ctx): Group[] {
  return ctx.db.groups
    .filter((g) => canAccessGroup(ctx.actor, g.id))
    .sort((a, b) => (b.cohortYear ?? 0) - (a.cohortYear ?? 0) || a.name.localeCompare(b.name, 'ja'))
}

export function createGroup(ctx: Ctx, input: ApiPayload<'groups.create'>): Group {
  requireAdmin(ctx.actor)
  if (ctx.db.groups.all().some((g) => g.name === input.name))
    throw conflict('同じ名前のグループが既に存在します')
  const group: Group = { id: ctx.runtime.uuid(), ...input }
  ctx.db.groups.insert(group)
  audit(ctx, 'group', group.id)
  return group
}

export function updateGroup(ctx: Ctx, input: ApiPayload<'groups.update'>): Group {
  requireAdmin(ctx.actor)
  const current = ctx.db.groups.find(input.id)
  if (!current) throw notFound('グループ')
  if (ctx.db.groups.all().some((g) => g.name === input.name && g.id !== input.id)) {
    throw conflict('同じ名前のグループが既に存在します')
  }
  const group: Group = { ...current, ...input }
  ctx.db.groups.update(group)
  audit(ctx, 'group', group.id)
  return group
}
