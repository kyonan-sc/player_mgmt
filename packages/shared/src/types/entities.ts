export type Role = 'admin' | 'coach' | 'viewer'
export type ActiveStatus = 'active' | 'inactive'
export type Team = 'A' | 'B' | 'C'
export type CycleStatus = 'draft' | 'open' | 'finalized'
export type AssessmentStatus = 'draft' | 'submitted'
export type ResultStatus = 'complete' | 'insufficient'

/** 項目別スコア。null は未評価（未観測）を表し、1点とは区別する。 */
export type ItemScores = Record<string, number | null>

export interface Player {
  id: string
  displayName: string
  jerseyNumber: number | null
  enrollmentGrade: number | null
  enrollmentYear: number | null
  groupId: string
  joinedDate: string | null
  status: ActiveStatus
  createdAt: string
  updatedAt: string
}

export interface Group {
  id: string
  name: string
  cohortYear: number | null
  status: ActiveStatus
}

export interface Coach {
  id: string
  googleSub: string | null
  email: string
  displayName: string
  role: Role
  status: ActiveStatus
  createdAt: string
  updatedAt: string
}

export interface CoachGroup {
  id: string
  coachId: string
  groupId: string
}

export interface AssessmentCycle {
  id: string
  groupId: string
  name: string
  startDate: string
  endDate: string
  criteriaVersionId: string
  minEvaluatorCount: number
  status: CycleStatus
  createdBy: string
  createdAt: string
  finalizedAt: string | null
  finalizedBy: string | null
}

export interface CyclePlayer {
  id: string
  cycleId: string
  playerId: string
}

export interface CriteriaVersion {
  id: string
  version: string
  name: string
  thresholdA: number
  thresholdB: number
  createdAt: string
  createdBy: string
}

export interface CriteriaCategory {
  id: string
  versionId: string
  /** バージョン間で共通のカテゴリ識別子（S-12） */
  categoryKey: string
  name: string
  weight: number
  sortOrder: number
}

/** 1〜5点の評価基準。2点・4点は隣接段階の中間として扱うため省略可。 */
export type Rubric = Partial<Record<'1' | '2' | '3' | '4' | '5', string>>

export interface CriteriaItem {
  id: string
  categoryId: string
  itemKey: string
  name: string
  description: string
  rubric: Rubric
  sortOrder: number
  /** 段階数（満点）。3 または 5。1〜maxScore の整数で評価する */
  maxScore: number
  /** true の項目は「未観察」（欠席・見学など）のまま提出できる。未観察は null で表し、平均から除く */
  allowUnobserved: boolean
}

export interface CriteriaCategoryWithItems extends CriteriaCategory {
  items: CriteriaItem[]
}

export interface CriteriaDefinition {
  version: CriteriaVersion
  categories: CriteriaCategoryWithItems[]
}

export interface Assessment {
  id: string
  cycleId: string
  playerId: string
  evaluatorId: string
  scores: ItemScores
  strengths: string
  improvementPoints: string
  comment: string
  status: AssessmentStatus
  revision: number
  createdAt: string
  updatedAt: string
  submittedAt: string | null
}

export interface AssessmentResult {
  id: string
  cycleId: string
  playerId: string
  evaluatorCount: number
  itemScores: Record<string, number>
  categoryScores: Record<string, number>
  totalScore: number | null
  recommendedTeam: Team | null
  status: ResultStatus
  criteriaVersionId: string
  finalizedAt: string
}

export interface TeamAssignment {
  id: string
  cycleId: string | null
  playerId: string
  recommendedTeam: Team | null
  assignedTeam: Team | null
  reason: string
  effectiveDate: string
  assignedBy: string
  createdAt: string
}

export interface AuditLog {
  id: string
  actorId: string
  action: string
  targetType: string
  targetId: string
  requestId: string
  createdAt: string
}

export interface AppSettings {
  teamName: string
  defaultMinEvaluatorCount: number
  defaultCriteriaVersionId: string | null
  progressWarningRate: number
}
