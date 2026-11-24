import type { Coach, Role } from '@kyonan/shared'
import { forbidden } from '../api/errors'
import type { Runtime } from '../infrastructure/runtime'
import type { Db } from '../repositories/db'

export interface Actor {
  coach: Coach
  groupIds: ReadonlySet<string>
}

export interface Ctx {
  db: Db
  runtime: Runtime
  actor: Actor
  requestId: string
  action: string
}

export const isAdmin = (actor: Actor) => actor.coach.role === 'admin'

export function requireRole(actor: Actor, roles: Role[]): void {
  if (!roles.includes(actor.coach.role)) throw forbidden()
}

export function requireAdmin(actor: Actor): void {
  requireRole(actor, ['admin'])
}

/** 学年・所属単位のアクセス制御。admin は全グループにアクセスできる。 */
export function canAccessGroup(actor: Actor, groupId: string): boolean {
  return isAdmin(actor) || actor.groupIds.has(groupId)
}

export function requireGroupAccess(actor: Actor, groupId: string): void {
  if (!canAccessGroup(actor, groupId)) throw forbidden('この学年グループへのアクセス権がありません')
}

/** コーチコメントの閲覧可否（Q-01：viewer は不可） */
export const canSeeComments = (actor: Actor) => actor.coach.role !== 'viewer'

/** 評価の入力可否 */
export const canEvaluate = (actor: Actor) =>
  actor.coach.role === 'admin' || actor.coach.role === 'coach'

export function nowIso(ctx: Ctx): string {
  return ctx.runtime.now().toISOString()
}

export function audit(ctx: Ctx, targetType: string, targetId: string, action = ctx.action): void {
  ctx.db.auditLogs.insert({
    id: ctx.runtime.uuid(),
    actorId: ctx.actor.coach.id,
    action,
    targetType,
    targetId,
    requestId: ctx.requestId,
    createdAt: nowIso(ctx),
  })
}
