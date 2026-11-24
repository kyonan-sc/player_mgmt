import type { Team } from '@kyonan/shared'
import { Cell, Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { TEAM_COLOR_VAR } from '@/components/common/display'

const config = {
  A: { label: 'Aチーム', color: TEAM_COLOR_VAR.A },
  B: { label: 'Bチーム', color: TEAM_COLOR_VAR.B },
  C: { label: 'Cチーム', color: TEAM_COLOR_VAR.C },
  unassigned: { label: '未編成', color: TEAM_COLOR_VAR.none },
} satisfies ChartConfig

/** チーム編成比率（ドーナツ）。凡例に人数と割合を数値で併記し、色だけに依存しない */
export function TeamDonutChart({ counts }: { counts: Record<Team | 'unassigned', number> }) {
  const data = (Object.keys(config) as (keyof typeof config)[]).map((key) => ({
    key,
    name: config[key].label,
    value: counts[key],
    fill: `var(--color-${key})`,
  }))
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <ChartContainer config={config} className="aspect-square h-44 shrink-0">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="key"
            innerRadius={52}
            outerRadius={78}
            strokeWidth={2}
            stroke="var(--card)"
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.fill} />
            ))}
          </Pie>
          <text
            x="50%"
            y="47%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground num text-2xl font-semibold"
          >
            {total}
          </text>
          <text
            x="50%"
            y="62%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground text-xs"
          >
            名
          </text>
        </PieChart>
      </ChartContainer>
      <ul className="w-full space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: config[d.key].color }}
              aria-hidden
            />
            <span className="flex-1">{d.name}</span>
            <span className="num font-medium">{d.value}名</span>
            <span className="num w-10 text-right text-muted-foreground">
              {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
