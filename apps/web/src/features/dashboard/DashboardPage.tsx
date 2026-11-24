import type { DashboardData } from '@kyonan/shared'
import { ArrowRight, ClipboardList, Gauge, TrendingUp, Users } from 'lucide-react'
import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { TeamDonutChart } from '@/components/charts/TeamDonutChart'
import {
  KpiCard,
  PageHeader,
  Pill,
  ScoreDelta,
  Section,
  TEAM_COLOR_VAR,
} from '@/components/common/display'
import { EmptyState, QueryView } from '@/components/states/states'
import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Progress } from '@/components/ui/progress'
import { useMe } from '@/features/auth/use-me'
import { formatPercent, formatScore, formatShortDate } from '@/lib/format'
import { useApiQuery } from '@/lib/query'

const trendConfig = {
  average: { label: '平均得点', color: 'var(--chart-1)' },
} satisfies ChartConfig
const teamTrendConfig = {
  A: { label: 'A', color: TEAM_COLOR_VAR.A },
  B: { label: 'B', color: TEAM_COLOR_VAR.B },
  C: { label: 'C', color: TEAM_COLOR_VAR.C },
} satisfies ChartConfig
const categoryConfig = {
  percent: { label: '得点率', color: 'var(--chart-2)' },
} satisfies ChartConfig

function Kpis({ data }: { data: DashboardData }) {
  const open = data.openCycles[0]
  const assigned = data.teamCounts.A + data.teamCounts.B + data.teamCounts.C
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        label="在籍選手数"
        value={data.activePlayerCount}
        unit="名"
        icon={<Users />}
        hint={`編成済み ${assigned}名・未編成 ${data.teamCounts.unassigned}名`}
      />
      <KpiCard
        label="最新評価の平均"
        value={formatScore(data.latestAverageScore)}
        unit={data.latestAverageScore === null ? undefined : '点'}
        icon={<Gauge />}
        hint={
          data.latestAverageScore === null ? 'まだ確定した評価がありません' : '各選手の最新確定評価'
        }
      />
      <KpiCard
        label="チーム構成"
        value={
          <span className="flex gap-3 text-2xl sm:text-[26px]">
            <span className="text-team-a">A {data.teamCounts.A}</span>
            <span className="text-team-b">B {data.teamCounts.B}</span>
            <span className="text-team-c">C {data.teamCounts.C}</span>
          </span>
        }
        hint="現在の所属チーム（人）"
      />
      <KpiCard
        label="実施中の評価"
        value={open ? formatPercent(open.progressRate) : '—'}
        icon={<ClipboardList />}
        hint={
          open
            ? `${open.cycle.name}・${open.completedCount}/${open.targetCount}名完了`
            : '実施中の評価期間はありません'
        }
      >
        {open && (
          <Progress value={open.progressRate * 100} className="mt-3 h-1.5" aria-label="評価進捗" />
        )}
      </KpiCard>
    </div>
  )
}

function PendingList({ data }: { data: DashboardData }) {
  const { canEvaluate } = useMe()
  if (!canEvaluate) return null
  const first = data.pendingForMe[0]
  return (
    <Section
      title="評価入力が必要な選手"
      description={
        data.pendingForMe.length > 0
          ? `あなたの未提出 ${data.pendingForMe.length}${data.pendingForMe.length >= 30 ? '+' : ''}名`
          : undefined
      }
      actions={
        first && (
          <Button size="sm" asChild>
            <Link to={`/assessments/${first.cycleId}/players/${first.player.id}`}>
              入力を始める <ArrowRight />
            </Link>
          </Button>
        )
      }
      contentClassName="p-0"
    >
      {data.pendingForMe.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">現在、入力が必要な評価はありません。</p>
      ) : (
        <ul className="max-h-80 divide-y overflow-y-auto">
          {data.pendingForMe.slice(0, 12).map((p) => (
            <li key={`${p.cycleId}-${p.player.id}`}>
              <Link
                to={`/assessments/${p.cycleId}/players/${p.player.id}`}
                className="flex min-h-12 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent sm:px-5"
              >
                <span className="num w-7 text-right text-sm text-muted-foreground">
                  {p.player.jerseyNumber ?? '—'}
                </span>
                <span className="flex-1 text-sm font-medium">{p.player.displayName}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {p.cycleName}
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Charts({ data }: { data: DashboardData }) {
  const categoryData = data.categoryAverages.map((c) => ({
    name: c.name,
    percent: Math.round((c.average / c.weight) * 1000) / 10,
    points: c.average,
    weight: c.weight,
  }))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="現在のチーム編成" description="在籍選手の所属チーム">
        <TeamDonutChart counts={data.teamCounts} />
      </Section>
      <Section title="カテゴリ別のチーム平均" description="配点に対する得点率（最新確定評価）">
        {categoryData.length === 0 ? (
          <EmptyState title="確定した評価がありません" className="py-8" />
        ) : (
          <ChartContainer config={categoryConfig} className="h-56 w-full">
            <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tickLine={false}
                axisLine={false}
              />
              <YAxis type="category" dataKey="name" width={64} tickLine={false} axisLine={false} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(v, _n, item) =>
                      `${v}%（${formatScore(item.payload.points)} / ${item.payload.weight}点）`
                    }
                  />
                }
              />
              <Bar
                dataKey="percent"
                fill="var(--color-percent)"
                radius={4}
                barSize={18}
                label={{
                  position: 'right',
                  fontSize: 12,
                  formatter: (v: unknown) => `${v}%`,
                  fill: 'var(--muted-foreground)',
                }}
              />
            </BarChart>
          </ChartContainer>
        )}
      </Section>
      <Section
        title="平均得点の推移"
        description="評価期間ごとの総合得点の平均（評価者数を満たした選手）"
      >
        {data.scoreTrend.length === 0 ? (
          <EmptyState title="確定した評価がありません" className="py-8" />
        ) : (
          <ChartContainer config={trendConfig} className="h-56 w-full">
            <LineChart data={data.scoreTrend} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 20, 40, 60, 80, 100]}
                width={32}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent labelFormatter={(_l, p) => p[0]?.payload.cycleName} />
                }
              />
              <Line
                dataKey="average"
                stroke="var(--color-average)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </Section>
      <Section title="チーム構成の推移" description="各評価後に適用された編成（人）">
        {data.teamTrend.length === 0 ? (
          <EmptyState title="編成履歴がありません" className="py-8" />
        ) : (
          <ChartContainer config={teamTrendConfig} className="h-56 w-full">
            <BarChart data={data.teamTrend} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tickLine={false}
                axisLine={false}
              />
              <YAxis width={28} allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent labelFormatter={(_l, p) => p[0]?.payload.cycleName} />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="A" stackId="t" fill="var(--color-A)" />
              <Bar dataKey="B" stackId="t" fill="var(--color-B)" />
              <Bar dataKey="C" stackId="t" fill="var(--color-C)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </Section>
    </div>
  )
}

function Activity({ data }: { data: DashboardData }) {
  const { growth } = data
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section
        title="前回評価からの成長"
        description="基準が互換な直近2回の確定評価を比較"
        contentClassName="space-y-4"
      >
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: '向上', value: growth.improved, tone: 'text-success' },
            { label: '変化なし', value: growth.unchanged, tone: 'text-muted-foreground' },
            { label: '低下', value: growth.declined, tone: 'text-destructive' },
          ].map((g) => (
            <div key={g.label} className="rounded-lg bg-muted/60 py-3">
              <div className={`num text-2xl font-semibold ${g.tone}`}>{g.value}</div>
              <div className="text-xs text-muted-foreground">{g.label}</div>
            </div>
          ))}
        </div>
        {growth.topImprovers.length > 0 && (
          <ul className="space-y-1">
            <li className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <TrendingUp className="size-3.5" /> 伸びが大きい選手
            </li>
            {growth.topImprovers.map((g) => (
              <li key={g.player.id}>
                <Link
                  to={`/players/${g.player.id}`}
                  className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-accent"
                >
                  <span>{g.player.displayName}</span>
                  <ScoreDelta value={g.diff} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="最近確定した評価" contentClassName="p-0">
        {data.recentFinalized.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">確定した評価期間はまだありません。</p>
        ) : (
          <ul className="divide-y">
            {data.recentFinalized.map((c) => (
              <li key={c.cycle.id}>
                <Link
                  to={`/results/${c.cycle.id}`}
                  className="flex min-h-12 items-center gap-3 px-4 py-3 hover:bg-accent sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.cycle.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.groupName}・判定 {c.completedCount}/{c.targetCount}名
                    </div>
                  </div>
                  <Pill>{formatShortDate(c.cycle.endDate)}</Pill>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

export function DashboardPage() {
  const query = useApiQuery('dashboard.get', {})
  const { me } = useMe()
  return (
    <>
      <PageHeader title="ダッシュボード" eyebrow={`こんにちは、${me?.displayName ?? ''}さん`} />
      <QueryView query={query}>
        {(data) =>
          data.activePlayerCount === 0 ? (
            <EmptyState
              title="在籍している選手がいません"
              description="選手を登録すると、評価と成長の状況がここに表示されます。"
            />
          ) : (
            <div className="space-y-4 sm:space-y-6">
              <Kpis data={data} />
              <PendingList data={data} />
              <Charts data={data} />
              <Activity data={data} />
            </div>
          )
        }
      </QueryView>
    </>
  )
}
