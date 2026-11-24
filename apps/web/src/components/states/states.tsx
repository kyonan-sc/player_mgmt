import type { UseQueryResult } from '@tanstack/react-query'
import { AlertTriangle, FileQuestion, Inbox, Lock, RefreshCw, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ApiClientError } from '@/lib/api-client'
import { cn } from '@/lib/utils'

interface StateFrameProps {
  icon: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  tone?: 'neutral' | 'warning' | 'danger'
}

function StateFrame({
  icon,
  title,
  description,
  action,
  className,
  tone = 'neutral',
}: StateFrameProps) {
  return (
    <div
      role={tone === 'neutral' ? 'status' : 'alert'}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center',
        className,
      )}
    >
      <div
        className={cn(
          'flex size-11 items-center justify-center rounded-full',
          tone === 'neutral' && 'bg-muted text-muted-foreground',
          tone === 'warning' && 'bg-warning/10 text-warning',
          tone === 'danger' && 'bg-destructive/10 text-destructive',
        )}
      >
        {icon}
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && (
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({
  title = 'データがありません',
  description,
  action,
  className,
}: Partial<Pick<StateFrameProps, 'title' | 'description' | 'action' | 'className'>>) {
  return (
    <StateFrame
      icon={<Inbox className="size-5" />}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  )
}

export function ForbiddenState({ description }: { description?: string }) {
  return (
    <StateFrame
      tone="warning"
      icon={<Lock className="size-5" />}
      title="この画面を表示する権限がありません"
      description={description ?? '必要な場合はチーム管理者に権限の付与を依頼してください。'}
      action={
        <Button variant="outline" asChild>
          <Link to="/">ダッシュボードへ戻る</Link>
        </Button>
      }
    />
  )
}

export function NotFoundState({ what = 'ページ' }: { what?: string }) {
  return (
    <StateFrame
      icon={<FileQuestion className="size-5" />}
      title={`${what}が見つかりません`}
      description="削除されたか、URL が正しくない可能性があります。"
      action={
        <Button variant="outline" asChild>
          <Link to="/">ダッシュボードへ戻る</Link>
        </Button>
      }
    />
  )
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: ApiClientError | Error | null
  onRetry?: () => void
}) {
  const network = error && 'code' in error && error.code === 'NETWORK_ERROR'
  return (
    <StateFrame
      tone="danger"
      icon={network ? <WifiOff className="size-5" /> : <AlertTriangle className="size-5" />}
      title={network ? '通信エラー' : 'データを取得できませんでした'}
      description={error?.message}
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw /> 再試行
          </Button>
        )
      }
    />
  )
}

export function LoadingState({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true" aria-label="読み込み中">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 rounded-xl" />
      ))}
    </div>
  )
}

/** クエリの状態（読み込み・エラー・権限不足・未検出）を統一的に表示する */
export function QueryView<T>({
  query,
  children,
  loading,
  notFoundWhat,
}: {
  query: UseQueryResult<T, ApiClientError>
  children: (data: T) => ReactNode
  loading?: ReactNode
  notFoundWhat?: string
}) {
  if (query.isPending) return <>{loading ?? <LoadingState />}</>
  if (query.isError) {
    if (query.error.code === 'FORBIDDEN')
      return <ForbiddenState description={query.error.message} />
    if (query.error.code === 'NOT_FOUND') return <NotFoundState what={notFoundWhat} />
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }
  return <>{children(query.data)}</>
}
