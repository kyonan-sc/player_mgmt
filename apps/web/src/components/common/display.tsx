import type { CycleStatus, Team } from '@kyonan/shared'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatDiff } from '@/lib/format'
export { TEAM_COLOR_VAR } from '@/lib/team'
import { cn } from '@/lib/utils'

const TEAM_STYLE: Record<Team | 'none', string> = {
  A: 'bg-team-a/10 text-team-a ring-team-a/25',
  B: 'bg-team-b/10 text-team-b ring-team-b/25',
  C: 'bg-team-c/12 text-team-c ring-team-c/25',
  none: 'bg-muted text-team-none ring-border',
}

/** チーム識別。色だけに依存せず、必ず A/B/C のラベルを表示する（要件 9.3） */
export function TeamBadge({
  team,
  emptyLabel = '未判定',
  size = 'md',
  prefix,
}: {
  team: Team | null | undefined
  emptyLabel?: string
  size?: 'sm' | 'md'
  prefix?: string
}) {
  const key = team ?? 'none'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md font-semibold whitespace-nowrap ring-1 ring-inset',
        size === 'sm' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-xs',
        TEAM_STYLE[key],
      )}
    >
      {prefix && <span className="font-normal opacity-80">{prefix}</span>}
      {team ? `${team}チーム` : emptyLabel}
    </span>
  )
}

export function ScoreDelta({
  value,
  className,
}: {
  value: number | null | undefined
  className?: string
}) {
  if (value === null || value === undefined) {
    return <span className={cn('num text-sm text-muted-foreground', className)}>—</span>
  }
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus
  return (
    <span
      className={cn(
        'num inline-flex items-center gap-0.5 text-sm font-medium',
        value > 0 && 'text-success',
        value < 0 && 'text-destructive',
        value === 0 && 'text-muted-foreground',
        className,
      )}
      aria-label={`前回比 ${formatDiff(value)}点`}
    >
      <Icon className="size-3.5" aria-hidden />
      {formatDiff(value)}
    </span>
  )
}

const CYCLE_STATUS: Record<CycleStatus, { label: string; className: string }> = {
  draft: { label: '下書き', className: 'bg-muted text-muted-foreground ring-border' },
  open: { label: '実施中', className: 'bg-primary/8 text-primary ring-primary/20' },
  finalized: { label: '確定済み', className: 'bg-team-a/8 text-team-a ring-team-a/20' },
}

export function CycleStatusBadge({ status }: { status: CycleStatus }) {
  const s = CYCLE_STATUS[status]
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium ring-1 ring-inset',
        s.className,
      )}
    >
      {status === 'open' && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
      {s.label}
    </span>
  )
}

export function Pill({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'primary'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        tone === 'neutral' && 'bg-muted text-muted-foreground ring-border',
        tone === 'success' && 'bg-success/8 text-success ring-success/20',
        tone === 'warning' && 'bg-warning/10 text-warning ring-warning/25',
        tone === 'danger' && 'bg-destructive/8 text-destructive ring-destructive/20',
        tone === 'primary' && 'bg-primary/8 text-primary ring-primary/20',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function KpiCard({
  label,
  value,
  unit,
  hint,
  icon,
  className,
  children,
}: {
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  icon?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-card sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="text-[13px] font-medium">{label}</span>
        {icon && <span className="[&_svg]:size-4">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="num text-[28px] leading-none font-semibold tracking-tight sm:text-[32px]">
          {value}
        </span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="mt-2 text-[13px] text-muted-foreground">{hint}</div>}
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {eyebrow && <div className="text-[13px] text-muted-foreground">{eyebrow}</div>}
        <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <section className={cn('min-w-0 rounded-xl border bg-card shadow-card', className)}>
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cn('p-4 sm:p-5', contentClassName)}>{children}</div>
    </section>
  )
}
