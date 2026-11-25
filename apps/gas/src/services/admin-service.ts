import {
  DEFAULT_APP_SETTINGS,
  validateCriteriaStructure,
  type ApiPayload,
  type AppSettings,
  type AuditLogView,
  type CoachWithGroups,
  type CriteriaDefinition,
  type Coach,
} from '@kyonan/shared'
import { conflict, invalid, notFound } from '../api/errors'
import { audit, nowIso, requireAdmin, type Ctx } from '../auth/authorization'
import type { Db } from '../repositories/db'
import type { AppSettingRow } from '../repositories/schema'
import { coachNames, loadAllCriteria, loadCriteria } from './queries'

// ---- 評価基準 ----

export function listCriteria(ctx: Ctx): CriteriaDefinition[] {
  return loadAllCriteria(ctx.db)
}

/** 評価基準は上書きせず、常に新しいバージョンとして作成する */
export function createCriteriaVersion(
  ctx: Ctx,
  input: ApiPayload<'criteria.createVersion'>,
): CriteriaDefinition {
  requireAdmin(ctx.actor)
  const issues = validateCriteriaStructure(input)
  if (issues.length > 0) throw invalid(issues[0]!.message, issues)
  if (ctx.db.criteriaVersions.all().some((v) => v.version === input.version)) {
    throw conflict(`バージョン名「${input.version}」は既に使用されています`)
  }
  const now = nowIso(ctx)
  const versionId = ctx.runtime.uuid()
  ctx.db.criteriaVersions.insert({
    id: versionId,
    version: input.version,
    name: input.name,
    thresholdA: input.thresholdA,
    thresholdB: input.thresholdB,
    createdAt: now,
    createdBy: ctx.actor.coach.id,
  })
  input.categories.forEach((c, ci) => {
    const categoryId = ctx.runtime.uuid()
    ctx.db.criteriaCategories.insert({
      id: categoryId,
      versionId,
      categoryKey: c.categoryKey,
      name: c.name,
      weight: c.weight,
      sortOrder: ci + 1,
    })
    ctx.db.criteriaItems.insert(
      ...c.items.map((item, ii) => ({
        id: ctx.runtime.uuid(),
        categoryId,
        itemKey: item.itemKey,
        name: item.name,
        description: item.description,
        rubric: item.rubric,
        sortOrder: ii + 1,
        maxScore: item.maxScore,
        allowUnobserved: item.allowUnobserved,
      })),
    )
  })
  audit(ctx, 'criteriaVersion', versionId)
  return loadCriteria(ctx.db, versionId)
}

// ---- コーチ ----

function toCoachView(db: Db, coach: Coach): CoachWithGroups {
  const { googleSub, ...rest } = coach
  return {
    coach: { ...rest, linked: Boolean(googleSub) },
    groupIds: db.coachGroups.filter((g) => g.coachId === coach.id).map((g) => g.groupId),
  }
}

export function listCoaches(ctx: Ctx): CoachWithGroups[] {
  requireAdmin(ctx.actor)
  return ctx.db.coaches
    .all()
    .slice()
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ja'))
    .map((c) => toCoachView(ctx.db, c))
}

function setCoachGroups(ctx: Ctx, coachId: string, groupIds: string[]): void {
  const unknown = groupIds.filter((id) => !ctx.db.groups.find(id))
  if (unknown.length > 0) throw invalid('存在しないグループが指定されています')
  ctx.db.coachGroups.remove(
    ctx.db.coachGroups.filter((g) => g.coachId === coachId).map((g) => g.id),
  )
  ctx.db.coachGroups.insert(
    ...[...new Set(groupIds)].map((groupId) => ({ id: ctx.runtime.uuid(), coachId, groupId })),
  )
}

export function createCoach(ctx: Ctx, input: ApiPayload<'coaches.create'>): CoachWithGroups {
  requireAdmin(ctx.actor)
  const email = input.email.toLowerCase()
  if (ctx.db.coaches.all().some((c) => c.email.toLowerCase() === email)) {
    throw conflict('このメールアドレスは既に登録されています')
  }
  const now = nowIso(ctx)
  const coach: Coach = {
    id: ctx.runtime.uuid(),
    googleSub: null,
    email,
    displayName: input.displayName,
    role: input.role,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  ctx.db.coaches.insert(coach)
  setCoachGroups(ctx, coach.id, input.groupIds)
  audit(ctx, 'coach', coach.id)
  return toCoachView(ctx.db, coach)
}

export function updateCoach(ctx: Ctx, input: ApiPayload<'coaches.update'>): CoachWithGroups {
  requireAdmin(ctx.actor)
  const current = ctx.db.coaches.find(input.id)
  if (!current) throw notFound('コーチ')
  const email = input.email.toLowerCase()
  if (ctx.db.coaches.all().some((c) => c.id !== current.id && c.email.toLowerCase() === email)) {
    throw conflict('このメールアドレスは既に登録されています')
  }
  const losesAdmin =
    current.role === 'admin' &&
    current.status === 'active' &&
    (input.role !== 'admin' || input.status !== 'active')
  if (losesAdmin) {
    const otherAdmins = ctx.db.coaches.filter(
      (c) => c.id !== current.id && c.role === 'admin' && c.status === 'active',
    )
    if (otherAdmins.length === 0) throw conflict('最後の有効な管理者は無効化・降格できません')
  }
  const coach: Coach = {
    ...current,
    email,
    // メールアドレスを変更した場合は Google アカウントの紐付けを解除し、次回ログインで再照合する
    googleSub: email === current.email.toLowerCase() ? current.googleSub : null,
    displayName: input.displayName,
    role: input.role,
    status: input.status,
    updatedAt: nowIso(ctx),
  }
  ctx.db.coaches.update(coach)
  setCoachGroups(ctx, coach.id, input.groupIds)
  audit(ctx, 'coach', coach.id)
  return toCoachView(ctx.db, coach)
}

// ---- システム設定（S-01） ----

export function getSettings(ctx: Ctx): AppSettings {
  const settings: Record<string, unknown> = { ...DEFAULT_APP_SETTINGS }
  for (const row of ctx.db.appSettings.all()) {
    if (row.id in DEFAULT_APP_SETTINGS) settings[row.id] = row.value
  }
  return settings as unknown as AppSettings
}

export function updateSettings(ctx: Ctx, input: ApiPayload<'settings.update'>): AppSettings {
  requireAdmin(ctx.actor)
  if (input.defaultCriteriaVersionId) loadCriteria(ctx.db, input.defaultCriteriaVersionId)
  const now = nowIso(ctx)
  const existing = new Set(ctx.db.appSettings.all().map((r) => r.id))
  const rows: AppSettingRow[] = (Object.keys(input) as (keyof AppSettings)[]).map((key) => ({
    id: key,
    value: input[key],
    updatedAt: now,
    updatedBy: ctx.actor.coach.id,
  }))
  ctx.db.appSettings.update(...rows.filter((r) => existing.has(r.id)))
  ctx.db.appSettings.insert(...rows.filter((r) => !existing.has(r.id)))
  audit(ctx, 'settings', 'app')
  return getSettings(ctx)
}

// ---- 操作履歴 ----

export function listAudit(ctx: Ctx, limit: number): AuditLogView[] {
  requireAdmin(ctx.actor)
  const names = coachNames(ctx.db)
  return ctx.db.auditLogs
    .all()
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((log) => ({ ...log, actorName: names.get(log.actorId) ?? '（不明）' }))
}
