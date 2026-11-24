import type { CycleOverview, CyclePlayerProgress } from '@kyonan/shared'
import { AlertTriangle, BarChart3, CheckCircle2, Loader2, Pencil, Play, Lock } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { CycleStatusBadge, KpiCard, PageHeader, Pill } from '@/components/common/display'
import { EmptyState, QueryView } from '@/components/states/states'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMe } from '@/features/auth/use-me'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useCycleOverview, useFinalizeCycle, useOpenCycle } from './api'
import { CycleFormDialog } from './CycleFormDialog'

type Filter = 'all' | 'none' | 'draft' | 'submitted'

const MY_STATUS: Record<
  CyclePlayerProgress['myStatus'],
  { label: string; tone: 'neutral' | 'warning' | 'success' }
> = {
  none: { label: '未評価', tone: 'neutral' },
  draft: { label: '下書き', tone: 'warning' },
  submitted: { label: '提出済み', tone: 'success' },
}

function FinalizeButton({ overview }: { overview: CycleOverview }) {
  const finalize = useFinalizeCycle()
  const insufficient = overview.summary.insufficientCount
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button>
          <Lock /> 評価を確定
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>評価を確定しますか？</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                確定後は評価内容を変更できません。訂正が必要な場合は訂正用の評価期間を作成します。
              </p>
              {insufficient > 0 && (
                <p className="flex gap-2 rounded-lg bg-warning/10 p-3 text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  評価者数が必要数（{overview.cycle.minEvaluatorCount}名）に満たない選手が{' '}
                  {insufficient}名います。これらの選手は「未判定」として確定されます。
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            disabled={finalize.isPending}
            onClick={() =>
              finalize.mutate({ id: overview.cycle.id, acknowledgeInsufficient: true })
            }
          >
            {finalize.isPending && <Loader2 className="animate-spin" />}
            {insufficient > 0 ? '未判定を含めて確定する' : '確定する'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Content({ overview }: { overview: CycleOverview }) {
  const { isAdmin } = useMe()
  const openCycle = useOpenCycle()
  const [filter, setFilter] = useState<Filter>('all')
  const { cycle, summary } = overview
  const players = overview.players.filter((p) => filter === 'all' || p.myStatus === filter)
  const firstPending = overview.players.find((p) => p.myStatus !== 'submitted')
  const editable = cycle.status === 'open'

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/assessments" className="hover:underline">
            選手評価
          </Link>
        }
        title={cycle.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CycleStatusBadge status={cycle.status} />
            <span className="num">
              {overview.groupName}・{formatDate(cycle.startDate)} 〜 {formatDate(cycle.endDate)}
              ・基準 {overview.criteria.version.version}
            </span>
          </span>
        }
        actions={
          <>
            {cycle.status === 'finalized' && (
              <Button variant="outline" asChild>
                <Link to={`/results/${cycle.id}`}>
                  <BarChart3 /> 評価結果
                </Link>
              </Button>
            )}
            {isAdmin && cycle.status === 'open' && (
              <Button variant="outline" asChild>
                <Link to={`/results/${cycle.id}`}>
                  <BarChart3 /> 暫定集計
                </Link>
              </Button>
            )}
            {isAdmin && cycle.status !== 'finalized' && (
              <CycleFormDialog
                cycle={cycle}
                trigger={
                  <Button variant="outline">
                    <Pencil /> 編集
                  </Button>
                }
              />
            )}
            {isAdmin && cycle.status === 'draft' && (
              <Button
                disabled={openCycle.isPending}
                onClick={() => openCycle.mutate({ id: cycle.id })}
              >
                {openCycle.isPending ? <Loader2 className="animate-spin" /> : <Play />} 評価を開始
              </Button>
            )}
            {overview.canFinalize && <FinalizeButton overview={overview} />}
          </>
        }
      />

      {cycle.status === 'draft' && (
        <div className="mb-4 rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
          この評価期間はまだ開始されていません。
          {isAdmin
            ? '「評価を開始」を押すと、現在の在籍選手が評価対象として固定され、コーチが入力できるようになります。'
            : '管理者が評価を開始すると入力できるようになります。'}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="あなたの提出済み"
          value={summary.mySubmitted}
          unit={`/ ${summary.targetCount}名`}
          icon={<CheckCircle2 />}
        />
        <KpiCard
          label="未評価・下書き"
          value={summary.myNotStarted + summary.myDraft}
          unit="名"
          hint={`未評価 ${summary.myNotStarted}・下書き ${summary.myDraft}`}
        />
        <KpiCard
          label="必要評価者数を満たした選手"
          value={summary.sufficientCount}
          unit="名"
          hint={`必要評価者数 ${cycle.minEvaluatorCount}名`}
        />
        <KpiCard
          label="評価不足"
          value={summary.insufficientCount}
          unit="名"
          className={cn(
            summary.insufficientCount > 0 && cycle.status === 'open' && 'border-warning/40',
          )}
        />
      </div>

      <div className="mt-6 mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">すべて</TabsTrigger>
            <TabsTrigger value="none">未評価</TabsTrigger>
            <TabsTrigger value="draft">下書き</TabsTrigger>
            <TabsTrigger value="submitted">提出済み</TabsTrigger>
          </TabsList>
        </Tabs>
        {editable && firstPending && (
          <Button asChild>
            <Link to={`/assessments/${cycle.id}/players/${firstPending.player.id}`}>
              未提出の選手から入力
            </Link>
          </Button>
        )}
      </div>

      {players.length === 0 ? (
        <EmptyState title="該当する選手はいません" />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-card">
          {players.map((p) => {
            const s = MY_STATUS[p.myStatus]
            const enough = p.submittedCount >= cycle.minEvaluatorCount
            return (
              <li key={p.player.id} className="flex min-h-16 items-center gap-3 px-4 py-3 sm:px-5">
                <span className="num w-7 text-right text-sm text-muted-foreground">
                  {p.player.jerseyNumber ?? '—'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.player.displayName}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Pill tone={s.tone}>{s.label}</Pill>
                    <span className={cn('num', !enough && 'text-warning')}>
                      提出 {p.submittedCount}/{cycle.minEvaluatorCount}名
                    </span>
                    <span className="hidden sm:inline">
                      最終更新 {formatDateTime(p.lastUpdatedAt)}
                    </span>
                  </div>
                </div>
                {editable ? (
                  <Button
                    variant={p.myStatus === 'submitted' ? 'outline' : 'default'}
                    size="sm"
                    className="h-10 sm:h-8"
                    asChild
                  >
                    <Link to={`/assessments/${cycle.id}/players/${p.player.id}`}>
                      {p.myStatus === 'submitted' ? '修正' : '評価入力'}
                    </Link>
                  </Button>
                ) : (
                  p.myStatus !== 'none' && (
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/assessments/${cycle.id}/players/${p.player.id}`}>表示</Link>
                    </Button>
                  )
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

export function CycleDetailPage() {
  const { cycleId = '' } = useParams()
  const query = useCycleOverview(cycleId)
  return (
    <QueryView query={query} notFoundWhat="評価期間">
      {(overview) => <Content overview={overview} />}
    </QueryView>
  )
}
