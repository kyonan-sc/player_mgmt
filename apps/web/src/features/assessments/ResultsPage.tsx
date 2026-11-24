import { TEAMS, type ResultsView } from '@kyonan/shared'
import { AlertTriangle, Download, Info } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import {
  CycleStatusBadge,
  PageHeader,
  ScoreDelta,
  Section,
  TEAM_COLOR_VAR,
  TeamBadge,
} from '@/components/common/display'
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useResults } from '@/features/assessment-cycles/api'
import { useMe } from '@/features/auth/use-me'
import { downloadCsv, toCsv } from '@/lib/csv'
import { formatDate, formatScore, itemLookup } from '@/lib/format'

function exportCsv(view: ResultsView) {
  const cats = view.criteria.categories
  const items = cats.flatMap((c) => c.items)
  const header = [
    '背番号',
    '選手名',
    '総合得点',
    ...cats.map((c) => c.name),
    ...items.map((i) => i.name),
    '前回差分',
    '推奨チーム',
    '所属チーム',
    '評価者数',
    '判定',
  ]
  const rows = view.rows.map((r) => [
    r.player.jerseyNumber ?? '',
    r.player.displayName,
    r.result.totalScore ?? '',
    ...cats.map((c) =>
      (r.result.categoryScores[c.categoryKey] ?? '') === ''
        ? ''
        : Number(r.result.categoryScores[c.categoryKey]!.toFixed(2)),
    ),
    ...items.map((i) =>
      r.result.itemScores[i.itemKey] === undefined
        ? ''
        : Number(r.result.itemScores[i.itemKey]!.toFixed(2)),
    ),
    r.diff ?? '',
    r.result.recommendedTeam ?? '未判定',
    r.currentTeam ?? '未編成',
    r.result.evaluatorCount,
    r.result.status === 'complete' ? '判定済み' : '評価不足',
  ])
  downloadCsv(`評価結果_${view.cycle.name}.csv`, toCsv(header, rows))
}

const distConfig = { count: { label: '人数', color: 'var(--chart-2)' } } satisfies ChartConfig
const avgConfig = { percent: { label: '得点率', color: 'var(--chart-1)' } } satisfies ChartConfig
const teamConfig = { count: { label: '人数', color: 'var(--chart-3)' } } satisfies ChartConfig
const spreadConfig = {
  count: { label: 'ばらつき大の選手数', color: 'var(--chart-4)' },
} satisfies ChartConfig
const diffConfig = { diff: { label: '前回差', color: 'var(--chart-1)' } } satisfies ChartConfig

function ResultCharts({ view }: { view: ResultsView }) {
  const scored = view.rows.filter((r) => r.result.totalScore !== null)
  const bins = Array.from({ length: 8 }, (_, i) => ({
    range: `${20 + i * 10}`,
    from: 20 + i * 10,
    count: 0,
  }))
  for (const r of scored) {
    const idx = Math.min(7, Math.max(0, Math.floor((r.result.totalScore! - 20) / 10)))
    bins[idx]!.count++
  }
  const avg = view.criteria.categories.map((c) => {
    const vals = scored
      .map((r) => r.result.categoryScores[c.categoryKey])
      .filter((v): v is number => typeof v === 'number')
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    return { name: c.name, percent: Math.round((mean / c.weight) * 1000) / 10 }
  })
  const teams = [
    ...TEAMS.map((t) => ({
      name: t,
      count: view.rows.filter((r) => r.result.recommendedTeam === t).length,
      fill: TEAM_COLOR_VAR[t],
    })),
    {
      name: '未判定',
      count: view.rows.filter((r) => !r.result.recommendedTeam).length,
      fill: TEAM_COLOR_VAR.none,
    },
  ]
  const items = itemLookup(view.criteria)
  const spread = [...items.entries()].map(([key, info]) => ({
    name: info.name,
    count: view.rows.filter((r) => r.highSpreadItemKeys.includes(key)).length,
  }))
  const diffs = view.rows
    .filter((r): r is typeof r & { diff: number } => r.diff !== null)
    .map((r) => ({ name: r.player.displayName, diff: r.diff }))
    .sort((a, b) => b.diff - a.diff)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="総合得点の分布" description="10点刻み（下限を含む）">
        <ChartContainer config={distConfig} className="h-52 w-full">
          <BarChart data={bins} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="range"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}〜`}
            />
            <YAxis width={28} allowDecimals={false} tickLine={false} axisLine={false} />
            <ChartTooltip
              content={<ChartTooltipContent labelFormatter={(l) => `${l}〜${Number(l) + 9.9}点`} />}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {bins.map((b) => (
                <Cell
                  key={b.range}
                  fill={
                    b.from >= view.criteria.version.thresholdA
                      ? TEAM_COLOR_VAR.A
                      : b.from >= view.criteria.version.thresholdB
                        ? TEAM_COLOR_VAR.B
                        : TEAM_COLOR_VAR.C
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </Section>
      <Section title="推奨チーム人数">
        <ChartContainer config={teamConfig} className="h-52 w-full">
          <BarChart data={teams} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} />
            <YAxis width={28} allowDecimals={false} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
            <Bar
              dataKey="count"
              radius={[4, 4, 0, 0]}
              label={{ position: 'top', fontSize: 12, fill: 'var(--foreground)' }}
            >
              {teams.map((t) => (
                <Cell key={t.name} fill={t.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </Section>
      <Section title="カテゴリ別平均点" description="配点に対する得点率">
        <ChartContainer config={avgConfig} className="h-52 w-full">
          <BarChart data={avg} layout="vertical" margin={{ left: 8, right: 32 }}>
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
              axisLine={false}
            />
            <YAxis type="category" dataKey="name" width={64} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}%`} />} />
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
      </Section>
      <Section title="評価者間のばらつき" description="最大と最小の差が2点以上の選手数（項目別）">
        <ChartContainer config={spreadConfig} className="h-52 w-full">
          <BarChart data={spread} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fontSize: 10 }}
            />
            <YAxis width={28} allowDecimals={false} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </Section>
      <Section
        title="前回評価との比較"
        description="総合得点の差分（基準が互換な前回評価がある選手）"
        className="lg:col-span-2"
      >
        {diffs.length === 0 ? (
          <EmptyState title="比較できる前回評価がありません" className="py-8" />
        ) : (
          <ChartContainer config={diffConfig} className="h-56 w-full">
            <BarChart data={diffs} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                interval={0}
                tick={{ fontSize: 10 }}
                angle={-45}
                textAnchor="end"
                height={56}
              />
              <YAxis width={32} tickLine={false} axisLine={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent formatter={(v) => `${Number(v) > 0 ? '+' : ''}${v}点`} />
                }
              />
              <Bar dataKey="diff" radius={3}>
                {diffs.map((d) => (
                  <Cell key={d.name} fill={d.diff >= 0 ? 'var(--success)' : 'var(--destructive)'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </Section>
    </div>
  )
}

function Content({ view }: { view: ResultsView }) {
  const { isAdmin, canEvaluate } = useMe()
  const [sortByScore, setSortByScore] = useState(true)
  const items = itemLookup(view.criteria)
  const rows = sortByScore
    ? view.rows
    : [...view.rows].sort((a, b) => (a.player.jerseyNumber ?? 999) - (b.player.jerseyNumber ?? 999))
  const { cycle } = view

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            to={canEvaluate ? `/assessments/${cycle.id}` : '/assessments'}
            className="hover:underline"
          >
            {canEvaluate ? cycle.name : '選手評価'}
          </Link>
        }
        title="評価結果"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CycleStatusBadge status={cycle.status} />
            <span className="num">
              {cycle.name}・{view.groupName}・{formatDate(cycle.endDate)}・基準{' '}
              {view.criteria.version.version}（A ≧ {view.criteria.version.thresholdA} / B ≧{' '}
              {view.criteria.version.thresholdB}）
            </span>
          </span>
        }
        actions={
          isAdmin &&
          !view.preview && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">
                  <Download /> CSV出力
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>個人情報を含むファイルを出力します</AlertDialogTitle>
                  <AlertDialogDescription>
                    出力するCSVには選手名と評価結果が含まれます。共有範囲に注意し、不要になったファイルは削除してください。公開の場所に保存しないでください。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={() => exportCsv(view)}>
                    理解して出力する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        }
      />

      {view.preview && (
        <div
          className="mb-4 flex gap-2 rounded-xl border border-warning/30 bg-warning/8 p-3.5 text-sm text-warning"
          role="status"
        >
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            確定前の暫定集計です（管理者のみ表示）。提出済みの評価のみを集計しています。ばらつきが大きい項目を確認してから確定してください。
          </span>
        </div>
      )}

      {view.rows.length === 0 ? (
        <EmptyState title="集計対象の選手がいません" />
      ) : (
        <div className="space-y-4 sm:space-y-6">
          <Section
            title="選手別の結果"
            description={`${view.rows.length}名`}
            contentClassName="p-0"
            actions={
              <Button variant="ghost" size="sm" onClick={() => setSortByScore((v) => !v)}>
                {sortByScore ? '背番号順にする' : '得点順にする'}
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="sticky left-0 z-10 bg-muted pl-4">選手</TableHead>
                    <TableHead className="text-right">総合</TableHead>
                    {view.criteria.categories.map((c) => (
                      <TableHead key={c.categoryKey} className="text-right">
                        {c.name}
                        <span className="ml-0.5 text-[10px] text-muted-foreground">
                          /{c.weight}
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="text-right">前回差</TableHead>
                    <TableHead>推奨</TableHead>
                    <TableHead>所属</TableHead>
                    <TableHead className="text-right">評価者</TableHead>
                    <TableHead className="pr-4">ばらつき</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.player.id}>
                      <TableCell className="sticky left-0 z-10 bg-card pl-4">
                        <Link
                          to={`/players/${r.player.id}`}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <span className="num w-5 text-right text-xs text-muted-foreground">
                            {r.player.jerseyNumber}
                          </span>
                          <span className="font-medium whitespace-nowrap">
                            {r.player.displayName}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="num text-right text-base font-semibold">
                        {formatScore(r.result.totalScore)}
                      </TableCell>
                      {view.criteria.categories.map((c) => (
                        <TableCell key={c.categoryKey} className="num text-right">
                          {formatScore(r.result.categoryScores[c.categoryKey])}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <ScoreDelta value={r.diff} />
                      </TableCell>
                      <TableCell>
                        <TeamBadge
                          team={r.result.recommendedTeam}
                          size="sm"
                          emptyLabel={r.result.status === 'insufficient' ? '未判定' : '—'}
                        />
                      </TableCell>
                      <TableCell>
                        <TeamBadge team={r.currentTeam} size="sm" emptyLabel="未編成" />
                      </TableCell>
                      <TableCell
                        className={`num text-right ${r.result.status === 'insufficient' ? 'text-warning' : ''}`}
                      >
                        {r.result.evaluatorCount}/{cycle.minEvaluatorCount}
                      </TableCell>
                      <TableCell className="pr-4">
                        {r.highSpreadItemKeys.length > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-7 items-center gap-1 rounded-md bg-warning/10 px-2 text-xs font-medium text-warning"
                              >
                                <AlertTriangle className="size-3.5" /> {r.highSpreadItemKeys.length}
                                項目
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {r.spreads
                                .filter((s) => r.highSpreadItemKeys.includes(s.itemKey))
                                .map(
                                  (s) =>
                                    `${items.get(s.itemKey)?.name ?? s.itemKey}：${s.min}〜${s.max}点`,
                                )
                                .join('、')}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
          <ResultCharts view={view} />
        </div>
      )}
    </>
  )
}

export function ResultsPage() {
  const { cycleId = '' } = useParams()
  const query = useResults(cycleId)
  return (
    <QueryView query={query} notFoundWhat="評価期間">
      {(view) => <Content view={view} />}
    </QueryView>
  )
}
