import type {
  ActiveStatus,
  Assessment,
  AssessmentCycle,
  AssessmentResult,
  AppSettings,
  AuditLog,
  Coach,
  CriteriaDefinition,
  Group,
  Player,
  Role,
  Team,
  TeamAssignment,
} from './entities'
import type { ItemSpread } from '../scoring'

export interface HealthStatus {
  status: 'ok'
  env: string
  schemaVersion: string
  serverTime: string
}

export interface Me {
  id: string
  email: string
  displayName: string
  role: Role
  groupIds: string[]
}

export interface ResultSummary {
  cycleId: string
  cycleName: string
  cycleEndDate: string
  criteriaVersionId: string
  totalScore: number | null
  categoryScores: Record<string, number>
  itemScores: Record<string, number>
  evaluatorCount: number
  recommendedTeam: Team | null
  status: AssessmentResult['status']
}

export interface PlayerListItem {
  player: Player
  groupName: string
  currentTeam: Team | null
  latest: ResultSummary | null
  /** 前回評価との差分。基準非互換・前回なしの場合は null */
  diff: number | null
}

export interface PlayerDetail {
  player: Player
  group: Group | null
  currentTeam: Team | null
  /** 確定済み結果（評価期間の終了日昇順） */
  results: ResultSummary[]
  /** 結果で参照されている評価基準 */
  criteria: Record<string, CriteriaDefinition>
  /** 最新評価期間における所属グループのカテゴリ別平均 */
  groupAverage: { cycleId: string; categoryScores: Record<string, number> } | null
  teamHistory: TeamAssignment[]
}

export interface AssessmentHistoryEntry {
  cycleId: string
  cycleName: string
  cycleEndDate: string
  evaluatorName: string
  assessment: Assessment
}

export interface CycleListItem {
  cycle: AssessmentCycle
  groupName: string
  criteriaVersionLabel: string
  targetCount: number
  /** 必要評価者数を満たした選手数 */
  completedCount: number
  progressRate: number
}

export interface CyclePlayerProgress {
  player: Player
  myStatus: 'none' | 'draft' | 'submitted'
  submittedCount: number
  lastUpdatedAt: string | null
}

export interface CycleOverview {
  cycle: AssessmentCycle
  groupName: string
  criteria: CriteriaDefinition
  players: CyclePlayerProgress[]
  myAssessments: Assessment[]
  summary: {
    targetCount: number
    mySubmitted: number
    myDraft: number
    myNotStarted: number
    sufficientCount: number
    insufficientCount: number
  }
  canFinalize: boolean
}

export interface ResultRow {
  player: Player
  result: AssessmentResult
  diff: number | null
  currentTeam: Team | null
  spreads: ItemSpread[]
  highSpreadItemKeys: string[]
}

export interface ResultsView {
  cycle: AssessmentCycle
  groupName: string
  criteria: CriteriaDefinition
  /** 確定前に管理者が確認するための暫定集計の場合 true */
  preview: boolean
  rows: ResultRow[]
}

export interface TeamBoardPlayer {
  player: Player
  currentTeam: Team | null
  recommendedTeam: Team | null
  latestCycleId: string | null
  totalScore: number | null
  diff: number | null
}

export interface TeamBoard {
  players: TeamBoardPlayer[]
  history: TeamAssignment[]
}

export interface CoachWithGroups {
  coach: Omit<Coach, 'googleSub'> & { linked: boolean }
  groupIds: string[]
}

export interface DashboardData {
  activePlayerCount: number
  teamCounts: Record<Team | 'unassigned', number>
  latestAverageScore: number | null
  openCycles: CycleListItem[]
  pendingForMe: { cycleId: string; cycleName: string; player: Player }[]
  recentFinalized: CycleListItem[]
  categoryAverages: { categoryKey: string; name: string; weight: number; average: number }[]
  scoreTrend: { cycleId: string; cycleName: string; date: string; average: number }[]
  teamTrend: { cycleId: string; cycleName: string; date: string; A: number; B: number; C: number }[]
  growth: {
    improved: number
    declined: number
    unchanged: number
    topImprovers: { player: Player; diff: number }[]
  }
}

export interface AuditLogView extends AuditLog {
  actorName: string
}

export type { AppSettings, ActiveStatus }
