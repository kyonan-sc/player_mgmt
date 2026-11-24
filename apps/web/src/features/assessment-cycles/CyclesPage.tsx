import type { CycleListItem } from '@kyonan/shared'
import { ChevronRight, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { CycleStatusBadge, PageHeader } from '@/components/common/display'
import { EmptyState, QueryView } from '@/components/states/states'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useMe } from '@/features/auth/use-me'
import { formatDate, formatPercent } from '@/lib/format'
import { useCycles } from './api'
import { CycleFormDialog } from './CycleFormDialog'

function cycleLink(item: CycleListItem, canEvaluate: boolean) {
  if (item.cycle.status === 'finalized') return `/results/${item.cycle.id}`
  return canEvaluate ? `/assessments/${item.cycle.id}` : null
}

export function CyclesPage() {
  const { isAdmin, canEvaluate } = useMe()
  const query = useCycles()
  return (
    <>
      <PageHeader
        title="選手評価"
        description="評価期間ごとの進捗と結果"
        actions={
          isAdmin && (
            <CycleFormDialog
              trigger={
                <Button>
                  <Plus /> 評価期間を作成
                </Button>
              }
            />
          )
        }
      />
      <QueryView query={query}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState
              title="評価期間がありません"
              description={
                isAdmin
                  ? '評価期間を作成して、選手の評価を始めましょう。'
                  : '管理者が評価期間を作成すると、ここに表示されます。'
              }
            />
          ) : (
            <ul className="space-y-3">
              {items.map((item) => {
                const to = cycleLink(item, canEvaluate)
                const body = (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <CycleStatusBadge status={item.cycle.status} />
                        <span className="text-xs text-muted-foreground">{item.groupName}</span>
                      </div>
                      <h2 className="mt-1.5 truncate text-base font-semibold">{item.cycle.name}</h2>
                      <p className="num mt-0.5 text-[13px] text-muted-foreground">
                        {formatDate(item.cycle.startDate)} 〜 {formatDate(item.cycle.endDate)}・基準{' '}
                        {item.criteriaVersionLabel}
                      </p>
                    </div>
                    <div className="w-full sm:w-64">
                      <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                        <span className="text-muted-foreground">
                          {item.cycle.status === 'finalized' ? '判定済み' : '評価完了'}
                        </span>
                        <span className="num">
                          <span className="font-semibold">{item.completedCount}</span>
                          <span className="text-muted-foreground">
                            {' '}
                            / {item.targetCount}名（{formatPercent(item.progressRate)}）
                          </span>
                        </span>
                      </div>
                      <Progress
                        value={item.progressRate * 100}
                        className="h-1.5"
                        aria-label={`${item.cycle.name}の進捗`}
                      />
                    </div>
                    {to && (
                      <ChevronRight className="hidden size-5 text-muted-foreground sm:block" />
                    )}
                  </div>
                )
                return (
                  <li key={item.cycle.id}>
                    {to ? (
                      <Link
                        to={to}
                        className="block rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-brand-accent/40 sm:p-5"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="rounded-xl border bg-card p-4 shadow-card sm:p-5">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )
        }
      </QueryView>
    </>
  )
}
