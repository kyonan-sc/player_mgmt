import type { ApiAction, ApiPayload, ApiResult } from '@kyonan/shared'
import type { Ctx } from '../auth/authorization'
import { toMe } from '../services/auth-service'
import {
  archivePlayer,
  createGroup,
  createPlayer,
  getPlayer,
  listGroups,
  listPlayers,
  updateGroup,
  updatePlayer,
} from '../services/player-service'
import {
  createCycle,
  finalizeCycle,
  listCycles,
  openCycle,
  updateCycle,
} from '../services/cycle-service'
import {
  getAssessmentHistory,
  getCycleOverview,
  listResults,
  saveAssessment,
} from '../services/assessment-service'
import { assignTeam, listTeams } from '../services/team-service'
import {
  createCoach,
  createCriteriaVersion,
  getSettings,
  listAudit,
  listCoaches,
  listCriteria,
  updateCoach,
  updateSettings,
} from '../services/admin-service'
import { getDashboard } from '../services/dashboard-service'

type AuthedAction = Exclude<ApiAction, 'health.check'>
type Handler<A extends AuthedAction> = (ctx: Ctx, payload: ApiPayload<A>) => ApiResult<A>

interface HandlerDef<A extends AuthedAction> {
  handler: Handler<A>
  /** 書き込みを伴う場合 true（LockService で直列化し、requestId による冪等化を行う） */
  mutating: boolean
}

const read = <A extends AuthedAction>(handler: Handler<A>): HandlerDef<A> => ({
  handler,
  mutating: false,
})
const write = <A extends AuthedAction>(handler: Handler<A>): HandlerDef<A> => ({
  handler,
  mutating: true,
})

export const handlers: { [A in AuthedAction]: HandlerDef<A> } = {
  'auth.me': read((ctx) => toMe(ctx.actor)),
  'dashboard.get': read(getDashboard),
  'players.list': read(listPlayers),
  'players.get': read((ctx, p) => getPlayer(ctx, p.id)),
  'players.create': write(createPlayer),
  'players.update': write(updatePlayer),
  'players.archive': write((ctx, p) => archivePlayer(ctx, p.id)),
  'groups.list': read((ctx) => listGroups(ctx)),
  'groups.create': write(createGroup),
  'groups.update': write(updateGroup),
  'coaches.list': read((ctx) => listCoaches(ctx)),
  'coaches.create': write(createCoach),
  'coaches.update': write(updateCoach),
  'cycles.list': read(listCycles),
  'cycles.create': write(createCycle),
  'cycles.update': write(updateCycle),
  'cycles.open': write((ctx, p) => openCycle(ctx, p.id)),
  'cycles.finalize': write(finalizeCycle),
  'assessments.list': read((ctx, p) => getCycleOverview(ctx, p.cycleId)),
  'assessments.save': write((ctx, p) => saveAssessment(ctx, p, false)),
  'assessments.submit': write((ctx, p) => saveAssessment(ctx, p, true)),
  'assessments.getHistory': read((ctx, p) => getAssessmentHistory(ctx, p.playerId)),
  'results.list': read((ctx, p) => listResults(ctx, p.cycleId)),
  'teams.list': read(listTeams),
  'teams.assign': write(assignTeam),
  'criteria.list': read((ctx) => listCriteria(ctx)),
  'criteria.createVersion': write(createCriteriaVersion),
  'audit.list': read((ctx, p) => listAudit(ctx, p.limit)),
  'settings.get': read((ctx) => getSettings(ctx)),
  'settings.update': write(updateSettings),
}
