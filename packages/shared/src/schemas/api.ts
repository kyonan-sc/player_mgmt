import { z } from 'zod'
import { DEFAULT_MIN_EVALUATOR_COUNT, ERROR_CODES, ROLES, TEAMS } from '../constants'
import type {
  Assessment,
  AssessmentCycle,
  AppSettings,
  Coach,
  CriteriaDefinition,
  Group,
  Player,
  TeamAssignment,
} from '../types/entities'
import type {
  AssessmentHistoryEntry,
  AuditLogView,
  CoachWithGroups,
  CycleListItem,
  CycleOverview,
  DashboardData,
  HealthStatus,
  Me,
  PlayerDetail,
  PlayerListItem,
  ResultsView,
  TeamBoard,
} from '../types/views'

/** 自由記述の最大長。Sheets のセル上限（50,000文字）より十分小さくする */
const TEXT_MAX = 2000

export const idSchema = z.string().trim().min(1).max(64)
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください')
const nameSchema = z.string().trim().min(1, '入力してください').max(100)
const textSchema = z.string().max(TEXT_MAX).default('')
const teamSchema = z.enum(TEAMS)
const scoreValueSchema = z.number().int().min(1).max(5).nullable()
export const itemScoresSchema = z.record(z.string().max(32), scoreValueSchema)

const empty = z.object({}).strict()

export const playerInputSchema = z.object({
  displayName: nameSchema,
  jerseyNumber: z.number().int().min(0).max(999).nullable(),
  enrollmentGrade: z.number().int().min(1).max(6).nullable(),
  enrollmentYear: z.number().int().min(2000).max(2100).nullable(),
  groupId: idSchema,
  joinedDate: dateSchema.nullable(),
  status: z.enum(['active', 'inactive']),
})
export type PlayerInput = z.infer<typeof playerInputSchema>

export const groupInputSchema = z.object({
  name: nameSchema,
  cohortYear: z.number().int().min(2000).max(2100).nullable(),
  status: z.enum(['active', 'inactive']),
})

export const coachInputSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません').max(254),
  displayName: nameSchema,
  role: z.enum(ROLES),
  groupIds: z.array(idSchema).max(50),
})
export type CoachInput = z.infer<typeof coachInputSchema>

export const cycleInputSchema = z
  .object({
    groupId: idSchema,
    name: nameSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    criteriaVersionId: idSchema,
    minEvaluatorCount: z.number().int().min(1).max(20).default(DEFAULT_MIN_EVALUATOR_COUNT),
  })
  .refine((v) => v.startDate <= v.endDate, {
    path: ['endDate'],
    message: '終了日は開始日以降にしてください',
  })
export type CycleInput = z.infer<typeof cycleInputSchema>

export const assessmentInputSchema = z.object({
  cycleId: idSchema,
  playerId: idSchema,
  scores: itemScoresSchema,
  strengths: textSchema,
  improvementPoints: textSchema,
  comment: textSchema,
  /** 新規作成時は null。既存評価の更新時は取得時の revision（S-08） */
  expectedRevision: z.number().int().min(0).nullable(),
})
export type AssessmentInput = z.infer<typeof assessmentInputSchema>

export const criteriaVersionInputSchema = z.object({
  version: z.string().trim().min(1).max(32),
  name: nameSchema,
  thresholdA: z.number().min(0).max(100),
  thresholdB: z.number().min(0).max(100),
  categories: z
    .array(
      z.object({
        categoryKey: z
          .string()
          .trim()
          .regex(/^[A-Z][A-Z0-9_-]{0,15}$/, '英大文字で入力してください'),
        name: nameSchema,
        weight: z.number().positive().max(100),
        items: z
          .array(
            z.object({
              itemKey: z
                .string()
                .trim()
                .regex(/^[A-Z][A-Z0-9_-]{0,31}$/, '英大文字で入力してください'),
              name: nameSchema,
              description: z.string().trim().max(500),
              rubric: z.object({
                '1': z.string().max(500).optional(),
                '2': z.string().max(500).optional(),
                '3': z.string().max(500).optional(),
                '4': z.string().max(500).optional(),
                '5': z.string().max(500).optional(),
              }),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
    .min(1)
    .max(10),
})
export type CriteriaVersionInput = z.infer<typeof criteriaVersionInputSchema>

export const settingsInputSchema = z.object({
  teamName: nameSchema,
  defaultMinEvaluatorCount: z.number().int().min(1).max(20),
  defaultCriteriaVersionId: idSchema.nullable(),
  progressWarningRate: z.number().min(0).max(1),
})

/** action ごとの payload スキーマ。バックエンドはこの定義で必ず検証する。 */
export const apiPayloadSchemas = {
  'health.check': empty,
  'auth.me': empty,
  'dashboard.get': z.object({ groupId: idSchema.optional() }),
  'players.list': z.object({
    groupId: idSchema.optional(),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
  }),
  'players.get': z.object({ id: idSchema }),
  'players.create': playerInputSchema,
  'players.update': playerInputSchema.extend({
    id: idSchema,
    expectedUpdatedAt: z.string().max(40),
  }),
  'players.archive': z.object({ id: idSchema }),
  'groups.list': empty,
  'groups.create': groupInputSchema,
  'groups.update': groupInputSchema.extend({ id: idSchema }),
  'coaches.list': empty,
  'coaches.create': coachInputSchema,
  'coaches.update': coachInputSchema.extend({
    id: idSchema,
    status: z.enum(['active', 'inactive']),
  }),
  'cycles.list': z.object({ groupId: idSchema.optional() }),
  'cycles.create': cycleInputSchema,
  'cycles.update': z.object({ id: idSchema, input: cycleInputSchema }),
  'cycles.open': z.object({ id: idSchema }),
  'cycles.finalize': z.object({
    id: idSchema,
    acknowledgeInsufficient: z.boolean().default(false),
  }),
  'assessments.list': z.object({ cycleId: idSchema }),
  'assessments.save': assessmentInputSchema,
  'assessments.submit': assessmentInputSchema,
  'assessments.getHistory': z.object({ playerId: idSchema }),
  'results.list': z.object({ cycleId: idSchema }),
  'teams.list': z.object({ groupId: idSchema.optional() }),
  'teams.assign': z.object({
    playerId: idSchema,
    assignedTeam: teamSchema.nullable(),
    reason: z.string().trim().max(TEXT_MAX).default(''),
    effectiveDate: dateSchema,
  }),
  'criteria.list': empty,
  'criteria.createVersion': criteriaVersionInputSchema,
  'audit.list': z.object({ limit: z.number().int().min(1).max(500).default(100) }),
  'settings.get': empty,
  'settings.update': settingsInputSchema,
} as const

export type ApiAction = keyof typeof apiPayloadSchemas
export const API_ACTIONS = Object.keys(apiPayloadSchemas) as ApiAction[]

/** 呼び出し側（フロントエンド）が渡す payload 型 */
export type ApiPayloadInput<A extends ApiAction> = z.input<(typeof apiPayloadSchemas)[A]>
/** 検証後（バックエンド側）の payload 型 */
export type ApiPayload<A extends ApiAction> = z.output<(typeof apiPayloadSchemas)[A]>

export interface ApiResultMap {
  'health.check': HealthStatus
  'auth.me': Me
  'dashboard.get': DashboardData
  'players.list': PlayerListItem[]
  'players.get': PlayerDetail
  'players.create': Player
  'players.update': Player
  'players.archive': Player
  'groups.list': Group[]
  'groups.create': Group
  'groups.update': Group
  'coaches.list': CoachWithGroups[]
  'coaches.create': CoachWithGroups
  'coaches.update': CoachWithGroups
  'cycles.list': CycleListItem[]
  'cycles.create': AssessmentCycle
  'cycles.update': AssessmentCycle
  'cycles.open': AssessmentCycle
  'cycles.finalize': AssessmentCycle
  'assessments.list': CycleOverview
  'assessments.save': Assessment
  'assessments.submit': Assessment
  'assessments.getHistory': AssessmentHistoryEntry[]
  'results.list': ResultsView
  'teams.list': TeamBoard
  'teams.assign': TeamAssignment
  'criteria.list': CriteriaDefinition[]
  'criteria.createVersion': CriteriaDefinition
  'audit.list': AuditLogView[]
  'settings.get': AppSettings
  'settings.update': AppSettings
}

export type ApiResult<A extends ApiAction> = ApiResultMap[A]
export type { Coach }

export const apiRequestSchema = z.object({
  action: z.string().max(64),
  requestId: z.string().min(8).max(64),
  idToken: z.string().max(4096).nullable().optional(),
  payload: z.unknown().optional(),
})
export type ApiRequestEnvelope = z.infer<typeof apiRequestSchema>

export const errorCodeSchema = z.enum(ERROR_CODES)

export interface ApiError {
  code: z.infer<typeof errorCodeSchema>
  message: string
  details?: { path: string; message: string }[]
}

export type ApiResponse<T> =
  | { success: true; data: T; requestId: string }
  | { success: false; error: ApiError; requestId: string }
