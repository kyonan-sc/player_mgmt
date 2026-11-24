import type {
  AppSettings,
  Assessment,
  AssessmentCycle,
  AssessmentResult,
  AuditLog,
  Coach,
  CoachGroup,
  CriteriaCategory,
  CriteriaItem,
  CriteriaVersion,
  CyclePlayer,
  Group,
  Player,
  TeamAssignment,
} from '@kyonan/shared'
import type { Cell, Row } from '../infrastructure/table-store'

/** テーブル定義のバージョン。列の追加・変更時に更新し、setupSheets でマイグレーションする。 */
export const SCHEMA_VERSION = '1'

type ColumnType = 'string' | 'nstring' | 'number' | 'nnumber' | 'json'

export interface ColumnDef {
  column: string
  field: string
  type: ColumnType
}

export interface TableDef<T> {
  name: string
  columns: ColumnDef[]
  /** 型付けのためのファントム */
  readonly _entity?: T
}

const col = (column: string, type: ColumnType = 'string', field = column): ColumnDef => ({
  column,
  field,
  type,
})

function table<T>(name: string, columns: ColumnDef[]): TableDef<T> {
  return { name, columns }
}

export interface AppSettingRow {
  id: keyof AppSettings
  value: unknown
  updatedAt: string
  updatedBy: string
}

export const TABLES = {
  players: table<Player>('players', [
    col('id'),
    col('displayName'),
    col('jerseyNumber', 'nnumber'),
    col('enrollmentGrade', 'nnumber'),
    col('enrollmentYear', 'nnumber'),
    col('groupId'),
    col('joinedDate', 'nstring'),
    col('status'),
    col('createdAt'),
    col('updatedAt'),
  ]),
  groups: table<Group>('groups', [
    col('id'),
    col('name'),
    col('cohortYear', 'nnumber'),
    col('status'),
  ]),
  coaches: table<Coach>('coaches', [
    col('id'),
    col('googleSub', 'nstring'),
    col('email'),
    col('displayName'),
    col('role'),
    col('status'),
    col('createdAt'),
    col('updatedAt'),
  ]),
  coachGroups: table<CoachGroup>('coach_groups', [col('id'), col('coachId'), col('groupId')]),
  cycles: table<AssessmentCycle>('assessment_cycles', [
    col('id'),
    col('groupId'),
    col('name'),
    col('startDate'),
    col('endDate'),
    col('criteriaVersionId'),
    col('minEvaluatorCount', 'number'),
    col('status'),
    col('createdBy'),
    col('createdAt'),
    col('finalizedAt', 'nstring'),
    col('finalizedBy', 'nstring'),
  ]),
  cyclePlayers: table<CyclePlayer>('cycle_players', [col('id'), col('cycleId'), col('playerId')]),
  criteriaVersions: table<CriteriaVersion>('criteria_versions', [
    col('id'),
    col('version'),
    col('name'),
    col('thresholdA', 'number'),
    col('thresholdB', 'number'),
    col('createdAt'),
    col('createdBy'),
  ]),
  criteriaCategories: table<CriteriaCategory>('criteria_categories', [
    col('id'),
    col('versionId'),
    col('categoryKey'),
    col('name'),
    col('weight', 'number'),
    col('sortOrder', 'number'),
  ]),
  criteriaItems: table<CriteriaItem>('criteria_items', [
    col('id'),
    col('categoryId'),
    col('itemKey'),
    col('name'),
    col('description'),
    col('rubricJson', 'json', 'rubric'),
    col('sortOrder', 'number'),
  ]),
  assessments: table<Assessment>('assessments', [
    col('id'),
    col('cycleId'),
    col('playerId'),
    col('evaluatorId'),
    col('scoresJson', 'json', 'scores'),
    col('strengths'),
    col('improvementPoints'),
    col('comment'),
    col('status'),
    col('revision', 'number'),
    col('createdAt'),
    col('updatedAt'),
    col('submittedAt', 'nstring'),
  ]),
  results: table<AssessmentResult>('assessment_results', [
    col('id'),
    col('cycleId'),
    col('playerId'),
    col('evaluatorCount', 'number'),
    col('itemScoresJson', 'json', 'itemScores'),
    col('categoryScoresJson', 'json', 'categoryScores'),
    col('totalScore', 'nnumber'),
    col('recommendedTeam', 'nstring'),
    col('status'),
    col('criteriaVersionId'),
    col('finalizedAt'),
  ]),
  teamAssignments: table<TeamAssignment>('team_assignments', [
    col('id'),
    col('cycleId', 'nstring'),
    col('playerId'),
    col('recommendedTeam', 'nstring'),
    col('assignedTeam', 'nstring'),
    col('reason'),
    col('effectiveDate'),
    col('assignedBy'),
    col('createdAt'),
  ]),
  auditLogs: table<AuditLog>('audit_logs', [
    col('id'),
    col('actorId'),
    col('action'),
    col('targetType'),
    col('targetId'),
    col('requestId'),
    col('createdAt'),
  ]),
  appSettings: table<AppSettingRow>('app_settings', [
    col('id'),
    col('value', 'json'),
    col('updatedAt'),
    col('updatedBy'),
  ]),
} as const

export type TableKey = keyof typeof TABLES
export const ALL_TABLES: TableDef<unknown>[] = Object.values(TABLES)

export function encodeRow<T>(def: TableDef<T>, entity: T): Row {
  const source = entity as Record<string, unknown>
  const row: Row = {}
  for (const c of def.columns) {
    const value = source[c.field]
    row[c.column] = encodeCell(c.type, value)
  }
  return row
}

function encodeCell(type: ColumnType, value: unknown): Cell {
  if (value === null || value === undefined) return ''
  switch (type) {
    case 'json':
      return JSON.stringify(value)
    case 'number':
    case 'nnumber':
      return typeof value === 'number' ? value : Number(value)
    default:
      return String(value)
  }
}

export function decodeRow<T>(def: TableDef<T>, row: Row): T {
  const entity: Record<string, unknown> = {}
  for (const c of def.columns) {
    entity[c.field] = decodeCell(c.type, row[c.column])
  }
  return entity as T
}

function decodeCell(type: ColumnType, raw: Cell | undefined): unknown {
  const empty = raw === null || raw === undefined || raw === ''
  switch (type) {
    case 'string':
      return empty ? '' : String(raw)
    case 'nstring':
      return empty ? null : String(raw)
    case 'number':
      return empty ? 0 : Number(raw)
    case 'nnumber':
      return empty ? null : Number(raw)
    case 'json':
      if (empty) return null
      try {
        return JSON.parse(String(raw))
      } catch {
        return null
      }
  }
}
