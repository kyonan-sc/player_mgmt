import {
  aggregateAssessments,
  type ApiPayload,
  type AssessmentCycle,
  type AssessmentResult,
  type CycleListItem,
} from '@kyonan/shared'
import { AppError, conflict, invalid, notFound } from '../api/errors'
import {
  audit,
  canAccessGroup,
  nowIso,
  requireAdmin,
  requireGroupAccess,
  type Ctx,
} from '../auth/authorization'
import type { Db } from '../repositories/db'
import { groupName, loadCriteria } from './queries'

export function getCycleOrThrow(ctx: Ctx, id: string): AssessmentCycle {
  const cycle = ctx.db.cycles.find(id)
  if (!cycle) throw notFound('評価期間')
  requireGroupAccess(ctx.actor, cycle.groupId)
  return cycle
}

/** 評価対象選手。開始前は対象グループの在籍選手、開始後は開始時点のスナップショット */
export function cyclePlayerIds(db: Db, cycle: AssessmentCycle): string[] {
  if (cycle.status === 'draft') {
    return db.players
      .filter((p) => p.groupId === cycle.groupId && p.status === 'active')
      .map((p) => p.id)
  }
  return db.cyclePlayers.filter((cp) => cp.cycleId === cycle.id).map((cp) => cp.playerId)
}

export function submittedCountByPlayer(db: Db, cycleId: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const a of db.assessments.filter((x) => x.cycleId === cycleId && x.status === 'submitted')) {
    map.set(a.playerId, (map.get(a.playerId) ?? 0) + 1)
  }
  return map
}

export function toCycleListItem(db: Db, cycle: AssessmentCycle): CycleListItem {
  const playerIds = cyclePlayerIds(db, cycle)
  let completedCount: number
  if (cycle.status === 'finalized') {
    completedCount = db.results.filter(
      (r) => r.cycleId === cycle.id && r.status === 'complete',
    ).length
  } else {
    const counts = submittedCountByPlayer(db, cycle.id)
    completedCount = playerIds.filter(
      (id) => (counts.get(id) ?? 0) >= cycle.minEvaluatorCount,
    ).length
  }
  const version = db.criteriaVersions.find(cycle.criteriaVersionId)
  return {
    cycle,
    groupName: groupName(db, cycle.groupId),
    criteriaVersionLabel: version ? `${version.version}（${version.name}）` : '—',
    targetCount: playerIds.length,
    completedCount,
    progressRate: playerIds.length === 0 ? 0 : completedCount / playerIds.length,
  }
}

export function listCycles(ctx: Ctx, p: ApiPayload<'cycles.list'>): CycleListItem[] {
  const { db, actor } = ctx
  return db.cycles
    .filter(
      (c) =>
        canAccessGroup(actor, c.groupId) &&
        (p.groupId === undefined || c.groupId === p.groupId) &&
        // viewer は確定済みのみ（Q-01）
        (actor.coach.role !== 'viewer' || c.status === 'finalized'),
    )
    .sort(
      (a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt),
    )
    .map((c) => toCycleListItem(db, c))
}

function validateRefs(ctx: Ctx, input: ApiPayload<'cycles.create'>): void {
  if (!ctx.db.groups.find(input.groupId)) throw invalid('対象グループが存在しません')
  loadCriteria(ctx.db, input.criteriaVersionId)
}

export function createCycle(ctx: Ctx, input: ApiPayload<'cycles.create'>): AssessmentCycle {
  requireAdmin(ctx.actor)
  validateRefs(ctx, input)
  const cycle: AssessmentCycle = {
    id: ctx.runtime.uuid(),
    ...input,
    status: 'draft',
    createdBy: ctx.actor.coach.id,
    createdAt: nowIso(ctx),
    finalizedAt: null,
    finalizedBy: null,
  }
  ctx.db.cycles.insert(cycle)
  audit(ctx, 'cycle', cycle.id)
  return cycle
}

export function updateCycle(ctx: Ctx, { id, input }: ApiPayload<'cycles.update'>): AssessmentCycle {
  requireAdmin(ctx.actor)
  const current = getCycleOrThrow(ctx, id)
  if (current.status === 'finalized') throw conflict('確定済みの評価期間は変更できません')
  if (
    current.status === 'open' &&
    (input.groupId !== current.groupId || input.criteriaVersionId !== current.criteriaVersionId)
  ) {
    throw conflict('評価開始後は対象グループと評価基準を変更できません')
  }
  validateRefs(ctx, input)
  const cycle: AssessmentCycle = { ...current, ...input }
  ctx.db.cycles.update(cycle)
  audit(ctx, 'cycle', id)
  return cycle
}

export function openCycle(ctx: Ctx, id: string): AssessmentCycle {
  requireAdmin(ctx.actor)
  const current = getCycleOrThrow(ctx, id)
  if (current.status === 'open') return current
  if (current.status !== 'draft') throw conflict('確定済みの評価期間は開始できません')
  const playerIds = cyclePlayerIds(ctx.db, current)
  if (playerIds.length === 0) throw invalid('対象グループに在籍中の選手がいません')
  // 途中失敗後の再実行に備え、既存スナップショットは重複登録しない
  const existing = new Set(
    ctx.db.cyclePlayers.filter((cp) => cp.cycleId === id).map((cp) => cp.playerId),
  )
  ctx.db.cyclePlayers.insert(
    ...playerIds
      .filter((pid) => !existing.has(pid))
      .map((playerId) => ({ id: ctx.runtime.uuid(), cycleId: id, playerId })),
  )
  const cycle: AssessmentCycle = { ...current, status: 'open' }
  ctx.db.cycles.update(cycle)
  audit(ctx, 'cycle', id)
  return cycle
}

/** 提出済み評価から評価期間の集計結果を計算する（確定前プレビュー・確定処理で共用） */
export function computeCycleResults(
  db: Db,
  cycle: AssessmentCycle,
  finalizedAt: string,
  existing: Map<string, AssessmentResult>,
  newId: () => string,
) {
  const criteria = loadCriteria(db, cycle.criteriaVersionId)
  const submitted = db.assessments.filter((a) => a.cycleId === cycle.id && a.status === 'submitted')
  return cyclePlayerIds(db, cycle).map((playerId) => {
    const aggregated = aggregateAssessments(
      criteria,
      submitted.filter((a) => a.playerId === playerId).map((a) => a.scores),
      cycle.minEvaluatorCount,
    )
    const result: AssessmentResult = {
      id: existing.get(playerId)?.id ?? newId(),
      cycleId: cycle.id,
      playerId,
      evaluatorCount: aggregated.evaluatorCount,
      itemScores: aggregated.itemScores,
      categoryScores: aggregated.categoryScores,
      totalScore: aggregated.totalScore,
      recommendedTeam: aggregated.recommendedTeam,
      status: aggregated.status,
      criteriaVersionId: cycle.criteriaVersionId,
      finalizedAt,
    }
    return { result, aggregated }
  })
}

/**
 * 評価確定。結果は (cycleId, playerId) で upsert し、最後に評価期間の状態を更新する。
 * 途中で失敗しても再実行で同じ結果に収束する（冪等）。
 */
export function finalizeCycle(ctx: Ctx, p: ApiPayload<'cycles.finalize'>): AssessmentCycle {
  requireAdmin(ctx.actor)
  const current = getCycleOrThrow(ctx, p.id)
  if (current.status === 'finalized') return current
  if (current.status !== 'open') throw conflict('評価が開始されていない評価期間は確定できません')

  const existing = new Map(
    ctx.db.results.filter((r) => r.cycleId === current.id).map((r) => [r.playerId, r]),
  )
  const finalizedAt = nowIso(ctx)
  const computed = computeCycleResults(ctx.db, current, finalizedAt, existing, () =>
    ctx.runtime.uuid(),
  )
  const insufficient = computed.filter((c) => c.result.status === 'insufficient').length
  if (insufficient > 0 && !p.acknowledgeInsufficient) {
    throw new AppError(
      'VALIDATION_ERROR',
      `評価者数が不足している選手が${insufficient}名います。確定すると未判定になります。`,
      [{ path: 'acknowledgeInsufficient', message: 'insufficient' }],
    )
  }
  const toUpdate = computed.filter((c) => existing.has(c.result.playerId)).map((c) => c.result)
  const toInsert = computed.filter((c) => !existing.has(c.result.playerId)).map((c) => c.result)
  ctx.db.results.update(...toUpdate)
  ctx.db.results.insert(...toInsert)

  const cycle: AssessmentCycle = {
    ...current,
    status: 'finalized',
    finalizedAt,
    finalizedBy: ctx.actor.coach.id,
  }
  ctx.db.cycles.update(cycle)
  audit(ctx, 'cycle', cycle.id)
  return cycle
}
