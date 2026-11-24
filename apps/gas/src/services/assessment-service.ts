import {
  aggregateAssessments,
  findMissingItems,
  listItemKeys,
  type ApiPayload,
  type Assessment,
  type AssessmentHistoryEntry,
  type CycleOverview,
  type ItemScores,
  type ResultsView,
} from '@kyonan/shared'
import { conflict, forbidden, invalid, notFound } from '../api/errors'
import {
  audit,
  canEvaluate,
  canSeeComments,
  isAdmin,
  nowIso,
  requireGroupAccess,
  type Ctx,
} from '../auth/authorization'
import {
  computeCycleResults,
  cyclePlayerIds,
  getCycleOrThrow,
  submittedCountByPlayer,
} from './cycle-service'
import {
  compareCycles,
  criteriaMap,
  currentTeams,
  finalizedResultsByPlayer,
  groupName,
  loadCriteria,
  coachNames,
  previousResult,
  scoreDiff,
} from './queries'

export function getCycleOverview(ctx: Ctx, cycleId: string): CycleOverview {
  const { db, actor } = ctx
  if (!canEvaluate(actor)) throw forbidden('評価状況を閲覧する権限がありません')
  const cycle = getCycleOrThrow(ctx, cycleId)
  const criteria = loadCriteria(db, cycle.criteriaVersionId)
  const playerIds = cyclePlayerIds(db, cycle)
  const counts = submittedCountByPlayer(db, cycle.id)
  const cycleAssessments = db.assessments.filter((a) => a.cycleId === cycle.id)
  const mine = cycleAssessments.filter((a) => a.evaluatorId === actor.coach.id)

  const players = playerIds
    .map((id) => db.players.find(id))
    .filter((p) => p !== undefined)
    .map((player) => {
      const my = mine.find((a) => a.playerId === player.id)
      const updates = cycleAssessments
        .filter(
          (a) => a.playerId === player.id && (isAdmin(actor) || a.evaluatorId === actor.coach.id),
        )
        .map((a) => a.updatedAt)
        .sort()
      return {
        player,
        myStatus: my ? my.status : ('none' as const),
        submittedCount: counts.get(player.id) ?? 0,
        lastUpdatedAt: updates[updates.length - 1] ?? null,
      }
    })
    .sort((a, b) => (a.player.jerseyNumber ?? 9999) - (b.player.jerseyNumber ?? 9999))

  const mySubmitted = players.filter((p) => p.myStatus === 'submitted').length
  const myDraft = players.filter((p) => p.myStatus === 'draft').length
  const sufficientCount = players.filter((p) => p.submittedCount >= cycle.minEvaluatorCount).length
  return {
    cycle,
    groupName: groupName(db, cycle.groupId),
    criteria,
    players,
    myAssessments: mine,
    summary: {
      targetCount: players.length,
      mySubmitted,
      myDraft,
      myNotStarted: players.length - mySubmitted - myDraft,
      sufficientCount,
      insufficientCount: players.length - sufficientCount,
    },
    canFinalize: isAdmin(actor) && cycle.status === 'open',
  }
}

export function saveAssessment(
  ctx: Ctx,
  input: ApiPayload<'assessments.save'>,
  submit: boolean,
): Assessment {
  const { db, actor } = ctx
  if (!canEvaluate(actor)) throw forbidden('評価を入力する権限がありません')
  const cycle = getCycleOrThrow(ctx, input.cycleId)
  if (cycle.status !== 'open') {
    throw conflict(
      cycle.status === 'finalized'
        ? '評価期間は確定済みのため変更できません'
        : '評価期間が開始されていません',
    )
  }
  if (
    !db.cyclePlayers.all().some((cp) => cp.cycleId === cycle.id && cp.playerId === input.playerId)
  ) {
    throw notFound('評価対象の選手')
  }

  const criteria = loadCriteria(db, cycle.criteriaVersionId)
  const itemKeys = listItemKeys(criteria)
  const unknown = Object.keys(input.scores).filter((k) => !itemKeys.includes(k))
  if (unknown.length > 0) throw invalid(`評価基準にない項目が含まれています: ${unknown.join(', ')}`)
  const scores: ItemScores = Object.fromEntries(itemKeys.map((k) => [k, input.scores[k] ?? null]))

  if (submit) {
    const missing = findMissingItems(criteria, scores)
    if (missing.length > 0) {
      throw invalid(
        `提出には全${itemKeys.length}項目の評価が必要です（未入力 ${missing.length}項目）`,
        missing.map((key) => ({ path: `scores.${key}`, message: '未入力' })),
      )
    }
  }

  const existing = db.assessments
    .all()
    .find(
      (a) =>
        a.cycleId === cycle.id && a.playerId === input.playerId && a.evaluatorId === actor.coach.id,
    )
  if ((existing?.revision ?? null) !== input.expectedRevision) {
    throw conflict(
      'この評価は別の端末または画面で更新されています。最新の内容を読み込み直してください。',
    )
  }

  const now = nowIso(ctx)
  const assessment: Assessment = {
    id: existing?.id ?? ctx.runtime.uuid(),
    cycleId: cycle.id,
    playerId: input.playerId,
    evaluatorId: actor.coach.id,
    scores,
    strengths: input.strengths,
    improvementPoints: input.improvementPoints,
    comment: input.comment,
    // 提出済み評価を変更（下書き保存）した場合は下書きに戻し、再提出を要求する
    status: submit ? 'submitted' : 'draft',
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    submittedAt: submit ? now : null,
  }
  if (existing) db.assessments.update(assessment)
  else db.assessments.insert(assessment)
  audit(ctx, 'assessment', assessment.id)
  return assessment
}

export function getAssessmentHistory(ctx: Ctx, playerId: string): AssessmentHistoryEntry[] {
  const { db, actor } = ctx
  if (!canSeeComments(actor)) throw forbidden('コーチコメントを閲覧する権限がありません')
  const player = db.players.find(playerId)
  if (!player) throw notFound('選手')
  requireGroupAccess(actor, player.groupId)
  const cycles = new Map(db.cycles.filter((c) => c.status === 'finalized').map((c) => [c.id, c]))
  const coaches = coachNames(db)
  return db.assessments
    .filter((a) => a.playerId === playerId && a.status === 'submitted' && cycles.has(a.cycleId))
    .map((assessment) => {
      const cycle = cycles.get(assessment.cycleId)!
      return {
        cycleId: cycle.id,
        cycleName: cycle.name,
        cycleEndDate: cycle.endDate,
        evaluatorName: coaches.get(assessment.evaluatorId) ?? '（不明）',
        assessment,
      }
    })
    .sort(
      (a, b) =>
        compareCycles(cycles.get(b.cycleId)!, cycles.get(a.cycleId)!) ||
        a.evaluatorName.localeCompare(b.evaluatorName, 'ja'),
    )
}

export function listResults(ctx: Ctx, cycleId: string): ResultsView {
  const { db, actor } = ctx
  const cycle = getCycleOrThrow(ctx, cycleId)
  const preview = cycle.status !== 'finalized'
  // 確定前の点数は独立評価のため一般コーチ・viewer には表示しない（要件7.7）
  if (preview && !isAdmin(actor)) throw forbidden('確定前の評価結果は管理者のみ閲覧できます')
  if (cycle.status === 'draft') throw conflict('評価が開始されていません')

  const criteria = loadCriteria(db, cycle.criteriaVersionId)
  const results = preview
    ? computeCycleResults(db, cycle, '', new Map(), () => '').map((c) => c.result)
    : db.results.filter((r) => r.cycleId === cycle.id)
  const submitted = db.assessments.filter((a) => a.cycleId === cycle.id && a.status === 'submitted')
  const history = finalizedResultsByPlayer(db)
  const criteriaById = criteriaMap(db)
  const teams = currentTeams(db)

  const rows = results
    .map((result) => {
      const player = db.players.find(result.playerId)
      if (!player) return null
      const aggregated = aggregateAssessments(
        criteria,
        submitted.filter((a) => a.playerId === player.id).map((a) => a.scores),
        cycle.minEvaluatorCount,
      )
      const prev = previousResult(history.get(player.id), cycle)
      return {
        player,
        result,
        diff: scoreDiff(result, prev?.result, criteriaById),
        currentTeam: teams.get(player.id) ?? null,
        spreads: aggregated.spreads,
        highSpreadItemKeys: aggregated.highSpreadItemKeys,
      }
    })
    .filter((r) => r !== null)
    .sort((a, b) => (b.result.totalScore ?? -1) - (a.result.totalScore ?? -1))

  return { cycle, groupName: groupName(db, cycle.groupId), criteria, preview, rows }
}

export function requireGroupOfPlayer(ctx: Ctx, playerId: string): void {
  const player = ctx.db.players.find(playerId)
  if (!player) throw notFound('選手')
  requireGroupAccess(ctx.actor, player.groupId)
}
