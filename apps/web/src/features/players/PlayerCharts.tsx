import type { CriteriaDefinition, PlayerDetail } from '@kyonan/shared'
import { useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatScore, formatShortDate, normalizeCategory } from '@/lib/format'

type SeriesKey = 'latest' | 'previous' | 'first' | 'group'

const radarConfig = {
  latest: { label: '最新', color: 'var(--chart-1)' },
  previous: { label: '前回', color: 'var(--chart-3)' },
  first: { label: '初回', color: 'var(--chart-4)' },
  group: { label: 'グループ平均', color: 'var(--chart-5)' },
} satisfies ChartConfig

/** 4カテゴリのレーダー。配点の違いによる偏りをなくすため各カテゴリを100%に正規化する（要件 7.4） */
export function CategoryRadar({
  detail,
  criteria,
}: {
  detail: PlayerDetail
  criteria: CriteriaDefinition
}) {
  const [visible, setVisible] = useState<SeriesKey[]>(['latest', 'previous'])
  const results = detail.results.filter((r) => r.evaluatorCount > 0)
  const latest = results[results.length - 1]
  const previous = results[results.length - 2]
  const first = results.length > 2 ? results[0] : undefined
  const sources: Record<SeriesKey, Record<string, number> | undefined> = {
    latest: latest?.categoryScores,
    previous: previous?.categoryScores,
    first: first?.categoryScores,
    group: detail.groupAverage?.categoryScores,
  }
  const available = (Object.keys(sources) as SeriesKey[]).filter((k) => sources[k])
  const data = criteria.categories.map((c) => {
    const row: Record<string, string | number | null> = { category: c.name }
    for (const key of available)
      row[key] = normalizeCategory(sources[key]?.[c.categoryKey], c.weight)
    return row
  })

  return (
    <div className="space-y-3">
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        value={visible}
        onValueChange={(v) => setVisible(v as SeriesKey[])}
        className="flex-wrap"
        aria-label="表示する系列"
      >
        {available.map((k) => (
          <ToggleGroupItem key={k} value={k} className="h-9 px-3 text-xs">
            <span
              className="mr-1.5 size-2 rounded-full"
              style={{ background: radarConfig[k].color }}
              aria-hidden
            />
            {radarConfig[k].label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ChartContainer config={radarConfig} className="mx-auto h-72 w-full max-w-md sm:h-80">
        <RadarChart data={data} outerRadius="72%">
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(v, name) => `${radarConfig[name as SeriesKey]?.label ?? name}: ${v}%`}
              />
            }
          />
          <PolarGrid />
          <PolarAngleAxis dataKey="category" tick={{ fontSize: 12, fill: 'var(--foreground)' }} />
          <PolarRadiusAxis
            domain={[0, 100]}
            tickCount={6}
            tick={{ fontSize: 10 }}
            axisLine={false}
            angle={90}
          />
          {available
            .filter((k) => visible.includes(k))
            .map((k) => (
              <Radar
                key={k}
                dataKey={k}
                stroke={`var(--color-${k})`}
                fill={`var(--color-${k})`}
                fillOpacity={k === 'latest' ? 0.18 : 0.04}
                strokeWidth={k === 'latest' ? 2 : 1.5}
                strokeDasharray={k === 'group' ? '4 3' : undefined}
                dot={{ r: 2.5 }}
              />
            ))}
        </RadarChart>
      </ChartContainer>
    </div>
  )
}

const itemConfig = {
  latest: { label: '最新', color: 'var(--chart-1)' },
  previous: { label: '前回', color: 'var(--chart-3)' },
} satisfies ChartConfig

/** 9項目を1〜5点で比較する詳細レーダー */
export function ItemRadar({
  detail,
  criteria,
}: {
  detail: PlayerDetail
  criteria: CriteriaDefinition
}) {
  const results = detail.results.filter((r) => r.evaluatorCount > 0)
  const latest = results[results.length - 1]
  const previous = results[results.length - 2]
  const data = criteria.categories.flatMap((c) =>
    c.items.map((i) => ({
      item: i.name,
      latest: latest?.itemScores[i.itemKey] ?? null,
      previous: previous?.itemScores[i.itemKey] ?? null,
    })),
  )
  return (
    <ChartContainer config={itemConfig} className="mx-auto h-72 w-full max-w-md sm:h-80">
      <RadarChart data={data} outerRadius="70%">
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(v, name) =>
                `${itemConfig[name as 'latest'].label}: ${formatScore(Number(v), 2)}点`
              }
            />
          }
        />
        <PolarGrid />
        <PolarAngleAxis dataKey="item" tick={{ fontSize: 11, fill: 'var(--foreground)' }} />
        <PolarRadiusAxis
          domain={[0, 5]}
          tickCount={6}
          tick={{ fontSize: 10 }}
          axisLine={false}
          angle={90}
        />
        {previous && (
          <Radar
            dataKey="previous"
            stroke="var(--color-previous)"
            fill="var(--color-previous)"
            fillOpacity={0.04}
            strokeWidth={1.5}
          />
        )}
        <Radar
          dataKey="latest"
          stroke="var(--color-latest)"
          fill="var(--color-latest)"
          fillOpacity={0.18}
          strokeWidth={2}
          dot={{ r: 2.5 }}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </RadarChart>
    </ChartContainer>
  )
}

const CATEGORY_COLORS = [
  'var(--chart-1)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-2)',
  'var(--chart-5)',
]

/**
 * 総合得点・カテゴリ別の成長グラフ。縦軸は0〜100に固定し、変化を過度に強調しない（要件 8章）。
 * 評価基準が変わった時点には注釈を表示する。
 */
export function GrowthChart({
  detail,
  mode,
}: {
  detail: PlayerDetail
  mode: 'total' | 'category'
}) {
  const results = detail.results
  const latestCriteria = detail.criteria[results[results.length - 1]?.criteriaVersionId ?? '']
  const data = results.map((r) => {
    const criteria = detail.criteria[r.criteriaVersionId]
    const row: Record<string, string | number | null> = {
      date: r.cycleEndDate,
      cycleName: r.cycleName,
      total: r.totalScore,
    }
    criteria?.categories.forEach((c) => {
      row[c.categoryKey] = normalizeCategory(r.categoryScores[c.categoryKey], c.weight)
    })
    return row
  })
  const changes = results.filter(
    (r, i) => i > 0 && r.criteriaVersionId !== results[i - 1]!.criteriaVersionId,
  )
  const thresholds = latestCriteria?.version

  const config: ChartConfig =
    mode === 'total'
      ? { total: { label: '総合得点', color: 'var(--chart-1)' } }
      : Object.fromEntries(
          (latestCriteria?.categories ?? []).map((c, i) => [
            c.categoryKey,
            { label: c.name, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]! },
          ]),
        )

  return (
    <ChartContainer config={config} className="h-64 w-full sm:h-72">
      <LineChart data={data} margin={{ left: 0, right: 16, top: 16, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatShortDate}
          tickLine={false}
          axisLine={false}
          minTickGap={16}
          padding={{ left: 12, right: 12 }}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 20, 40, 60, 80, 100]}
          width={34}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => (mode === 'category' ? `${v}%` : String(v))}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_l, p) => `${p[0]?.payload.cycleName ?? ''}`}
              formatter={(v, name) =>
                `${config[String(name)]?.label ?? name}: ${mode === 'total' ? `${formatScore(Number(v))}点` : `${v}%`}`
              }
            />
          }
        />
        {mode === 'total' && thresholds && (
          <>
            <ReferenceLine
              y={thresholds.thresholdA}
              stroke="var(--team-a)"
              strokeDasharray="4 4"
              label={{
                value: `A ${thresholds.thresholdA}`,
                position: 'insideTopRight',
                fontSize: 11,
                fill: 'var(--team-a)',
              }}
            />
            <ReferenceLine
              y={thresholds.thresholdB}
              stroke="var(--team-b)"
              strokeDasharray="4 4"
              label={{
                value: `B ${thresholds.thresholdB}`,
                position: 'insideTopRight',
                fontSize: 11,
                fill: 'var(--team-b)',
              }}
            />
          </>
        )}
        {changes.map((r) => (
          <ReferenceLine
            key={r.cycleId}
            x={r.cycleEndDate}
            stroke="var(--warning)"
            strokeDasharray="2 3"
            label={{
              value: `基準変更（${detail.criteria[r.criteriaVersionId]?.version.version ?? ''}）`,
              position: 'insideTopLeft',
              fontSize: 10,
              fill: 'var(--warning)',
            }}
          />
        ))}
        {Object.keys(config).map((key) => (
          <Line
            key={key}
            dataKey={key}
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
        ))}
        {mode === 'category' && <ChartLegend content={<ChartLegendContent />} />}
      </LineChart>
    </ChartContainer>
  )
}
