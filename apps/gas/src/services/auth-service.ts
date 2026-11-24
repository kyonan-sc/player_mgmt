import type { Coach, Me } from '@kyonan/shared'
import { AppError } from '../api/errors'
import type { Actor } from '../auth/authorization'
import type { VerifiedClaims } from '../auth/verifier'
import type { Runtime } from '../infrastructure/runtime'
import type { Db } from '../repositories/db'

const notRegistered = () =>
  new AppError(
    'FORBIDDEN',
    'このGoogleアカウントは登録されていません。管理者に登録を依頼してください。',
  )

type Resolution =
  { kind: 'found'; coach: Coach } | { kind: 'bind'; coach: Coach } | { kind: 'bootstrap' }

function resolve(db: Db, claims: VerifiedClaims, runtime: Runtime): Resolution {
  const coaches = db.coaches.all()
  const bySub = coaches.find((c) => c.googleSub === claims.sub)
  if (bySub) return { kind: 'found', coach: bySub }

  const byEmail = coaches.find((c) => c.email.toLowerCase() === claims.email)
  if (byEmail) {
    // 既に別の Google アカウントに紐付いている登録には紐付け直さない
    if (byEmail.googleSub) throw notRegistered()
    return { kind: 'bind', coach: byEmail }
  }

  const bootstrapEmail = runtime.config.bootstrapAdminEmail?.toLowerCase()
  const hasActiveAdmin = coaches.some((c) => c.role === 'admin' && c.status === 'active')
  if (bootstrapEmail && bootstrapEmail === claims.email && !hasActiveAdmin)
    return { kind: 'bootstrap' }
  throw notRegistered()
}

/**
 * 検証済みクレームからコーチを特定する。
 * 初回ログイン時は検証済みメールアドレスで照合して sub を紐付け、以後は sub で識別する。
 */
export function resolveActor(
  createDb: () => Db,
  claims: VerifiedClaims,
  runtime: Runtime,
  requestId: string,
): { actor: Actor; db: Db } {
  if (!claims.emailVerified) throw notRegistered()
  let db = createDb()
  let resolution = resolve(db, claims, runtime)

  if (resolution.kind !== 'found') {
    db = runtime.withLock(() => {
      const lockedDb = createDb()
      const r = resolve(lockedDb, claims, runtime)
      const now = runtime.now().toISOString()
      if (r.kind === 'bind') {
        lockedDb.coaches.update({ ...r.coach, googleSub: claims.sub, updatedAt: now })
        lockedDb.auditLogs.insert({
          id: runtime.uuid(),
          actorId: r.coach.id,
          action: 'auth.linkAccount',
          targetType: 'coach',
          targetId: r.coach.id,
          requestId,
          createdAt: now,
        })
      } else if (r.kind === 'bootstrap') {
        const id = runtime.uuid()
        lockedDb.coaches.insert({
          id,
          googleSub: claims.sub,
          email: claims.email,
          displayName: claims.name ?? claims.email,
          role: 'admin',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
        lockedDb.auditLogs.insert({
          id: runtime.uuid(),
          actorId: id,
          action: 'auth.bootstrapAdmin',
          targetType: 'coach',
          targetId: id,
          requestId,
          createdAt: now,
        })
      }
      return createDb()
    })
    resolution = resolve(db, claims, runtime)
    if (resolution.kind !== 'found') throw notRegistered()
  }

  const coach = resolution.coach
  if (coach.status !== 'active') {
    throw new AppError(
      'FORBIDDEN',
      'このアカウントは無効化されています。管理者に確認してください。',
    )
  }
  const groupIds = new Set(
    db.coachGroups.filter((g) => g.coachId === coach.id).map((g) => g.groupId),
  )
  return { actor: { coach, groupIds }, db }
}

export function toMe(actor: Actor): Me {
  return {
    id: actor.coach.id,
    email: actor.coach.email,
    displayName: actor.coach.displayName,
    role: actor.coach.role,
    groupIds: [...actor.groupIds],
  }
}
