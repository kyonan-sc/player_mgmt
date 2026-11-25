import {
  isCriteriaCompatible,
  roundScore,
  type AssessmentCycle,
  type AssessmentResult,
  type CriteriaDefinition,
  type Player,
  type ResultSummary,
  type Team,
  type TeamAssignment,
} from '@kyonan/shared'
import { notFound } from '../api/errors'
import { canAccessGroup, type Actor } from '../auth/authorization'
import { GUEST_ID, GUEST_NAME } from '../auth/guest-auth'
import type { Db } from '../repositories/db'

export function loadAllCriteria(db: Db): CriteriaDefinition[] {
  const categories = db.criteriaCategories.all()
  const items = db.criteriaItems.all()
  return [...db.criteriaVersions.all()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((version) => ({
      version,
      categories: categories
        .filter((c) => c.versionId === version.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => ({
          ...c,
          items: items
            .filter((i) => i.categoryId === c.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            // 列追加前の既存データは、5段階・未観察なしとして扱う
            .map((i) => ({ ...i, maxScore: i.maxScore > 0 ? i.maxScore : 5 })),
        })),
    }))
}

export function loadCriteria(db: Db, versionId: string): CriteriaDefinition {
  const found = loadAllCriteria(db).find((c) => c.version.id === versionId)
  if (!found) throw notFound('評価基準')
  return found
}

export function criteriaMap(db: Db): Map<string, CriteriaDefinition> {
  return new Map(loadAllCriteria(db).map((c) => [c.version.id, c]))
}

export function visiblePlayers(db: Db, actor: Actor, groupId?: string): Player[] {
  return db.players.filter(
    (p) => canAccessGroup(actor, p.groupId) && (groupId === undefined || p.groupId === groupId),
  )
}

export function compareCycles(a: AssessmentCycle, b: AssessmentCycle): number {
  return (
    a.endDate.localeCompare(b.endDate) ||
    (a.finalizedAt ?? '').localeCompare(b.finalizedAt ?? '') ||
    a.createdAt.localeCompare(b.createdAt)
  )
}

export interface ResultWithCycle {
  result: AssessmentResult
  cycle: AssessmentCycle
}

/** 選手ごとの確定済み結果（評価期間の終了日昇順） */
export function finalizedResultsByPlayer(db: Db): Map<string, ResultWithCycle[]> {
  const cycles = new Map(db.cycles.filter((c) => c.status === 'finalized').map((c) => [c.id, c]))
  const map = new Map<string, ResultWithCycle[]>()
  for (const result of db.results.all()) {
    const cycle = cycles.get(result.cycleId)
    if (!cycle) continue
    const list = map.get(result.playerId) ?? []
    list.push({ result, cycle })
    map.set(result.playerId, list)
  }
  for (const list of map.values()) list.sort((a, b) => compareCycles(a.cycle, b.cycle))
  return map
}

export function toSummary({ result, cycle }: ResultWithCycle): ResultSummary {
  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    cycleEndDate: cycle.endDate,
    criteriaVersionId: result.criteriaVersionId,
    totalScore: result.totalScore,
    categoryScores: result.categoryScores,
    itemScores: result.itemScores,
    evaluatorCount: result.evaluatorCount,
    recommendedTeam: result.recommendedTeam,
    status: result.status,
  }
}

/** 前回評価との差分（S-04/S-05）。基準が非互換・得点なしの場合は null */
export function scoreDiff(
  current: { totalScore: number | null; criteriaVersionId: string } | undefined,
  previous: { totalScore: number | null; criteriaVersionId: string } | undefined,
  criteria: Map<string, CriteriaDefinition>,
): number | null {
  if (!current || !previous || current.totalScore === null || previous.totalScore === null)
    return null
  const a = criteria.get(current.criteriaVersionId)
  const b = criteria.get(previous.criteriaVersionId)
  if (!a || !b || !isCriteriaCompatible(a, b)) return null
  return roundScore(current.totalScore - previous.totalScore)
}

export function isCompatibleWith(
  criteria: Map<string, CriteriaDefinition>,
  versionId: string,
  reference: CriteriaDefinition,
): boolean {
  const target = criteria.get(versionId)
  return target !== undefined && isCriteriaCompatible(target, reference)
}

/** 対象評価期間より前に確定した直近の結果 */
export function previousResult(
  history: ResultWithCycle[] | undefined,
  cycle: AssessmentCycle,
): ResultWithCycle | undefined {
  if (!history) return undefined
  const before = history.filter((h) => h.cycle.id !== cycle.id && compareCycles(h.cycle, cycle) < 0)
  return before[before.length - 1]
}

export function compareAssignments(a: TeamAssignment, b: TeamAssignment): number {
  return a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt)
}

/** 現在の所属チーム（S-06）。asOf 指定時はその日付時点 */
export function currentTeams(db: Db, asOf?: string): Map<string, Team | null> {
  const map = new Map<string, Team | null>()
  const sorted = db.teamAssignments
    .filter((a) => asOf === undefined || a.effectiveDate <= asOf)
    .sort(compareAssignments)
  for (const a of sorted) map.set(a.playerId, a.assignedTeam)
  return map
}

export function groupName(db: Db, groupId: string): string {
  return db.groups.find(groupId)?.name ?? '（不明なグループ）'
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** コーチ ID → 表示名。登録コーチに加えて、パスワード入場のゲストも解決する */
export function coachNames(db: Db): Map<string, string> {
  const names = new Map(db.coaches.all().map((c) => [c.id, c.displayName]))
  if (!names.has(GUEST_ID)) names.set(GUEST_ID, GUEST_NAME)
  return names
}
