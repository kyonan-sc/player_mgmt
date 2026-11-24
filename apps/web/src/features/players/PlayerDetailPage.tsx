import { isCriteriaCompatible, roundScore, type PlayerDetail } from '@kyonan/shared'
import { Archive, Info, MessageSquareText, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { KpiCard, PageHeader, ScoreDelta, Section, TeamBadge } from '@/components/common/display'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMe } from '@/features/auth/use-me'
import { formatDate, formatScore } from '@/lib/format'
import { useArchivePlayer, useAssessmentHistory, usePlayer } from './api'
import { CategoryRadar, GrowthChart, ItemRadar } from './PlayerCharts'

function compatibleDiff(
  detail: PlayerDetail,
  a: number | null | undefined,
  b: number | null | undefined,
  idxA: number,
  idxB: number,
) {
  const ra = detail.results[idxA]
  const rb = detail.results[idxB]
  if (!ra || !rb || a == null || b == null) return null
  const ca = detail.criteria[ra.criteriaVersionId]
  const cb = detail.criteria[rb.criteriaVersionId]
  if (!ca || !cb || !isCriteriaCompatible(ca, cb)) return null
  return roundScore(a - b)
}

function ItemDetailTable({ detail }: { detail: PlayerDetail }) {
  const n = detail.results.length
  const latest = detail.results[n - 1]!
  const criteria = detail.criteria[latest.criteriaVersionId]
  if (!criteria) return null
  const prev = detail.results[n - 2]
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <Table className="min-w-[520px]">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4 sm:pl-2">評価項目</TableHead>
            <TableHead className="text-right">最新</TableHead>
            <TableHead className="text-right">前回</TableHead>
            <TableHead className="text-right">差分</TableHead>
            <TableHead className="text-right">評価者数</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {criteria.categories.map((c) =>
            c.items.map((item, i) => {
              const cur = latest.itemScores[item.itemKey]
              const before = prev?.itemScores[item.itemKey]
              return (
                <TableRow key={item.itemKey}>
                  <TableCell className="pl-4 sm:pl-2">
                    <div className="flex items-center gap-1.5">
                      {i === 0 && (
                        <span className="w-14 shrink-0 text-xs text-muted-foreground">
                          {c.name}
                        </span>
                      )}
                      {i !== 0 && <span className="w-14 shrink-0" />}
                      <span className="font-medium">{item.name}</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`${item.name}の評価基準`}
                          >
                            <Info className="size-3.5 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 text-sm">
                          <p className="font-medium">{item.name}</p>
                          <p className="mt-1 text-muted-foreground">{item.description}</p>
                          <dl className="mt-3 space-y-1.5">
                            {(['5', '3', '1'] as const).map((lv) => (
                              <div key={lv} className="flex gap-2">
                                <dt className="num w-8 shrink-0 font-semibold">{lv}点</dt>
                                <dd className="text-muted-foreground">{item.rubric[lv] ?? '—'}</dd>
                              </div>
                            ))}
                          </dl>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableCell>
                  <TableCell className="num text-right font-semibold">
                    {formatScore(cur, 2)}
                  </TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {formatScore(before, 2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <ScoreDelta value={compatibleDiff(detail, cur, before, n - 1, n - 2)} />
                  </TableCell>
                  <TableCell className="num text-right text-muted-foreground">
                    {latest.evaluatorCount}名
                  </TableCell>
                </TableRow>
              )
            }),
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function CoachComments({ playerId }: { playerId: string }) {
  const { canSeeComments } = useMe()
  const query = useAssessmentHistory(playerId, canSeeComments)
  if (!canSeeComments) return null
  return (
    <Section title="コーチコメント" description="確定済みの評価期間" contentClassName="p-0">
      <QueryView
        query={query}
        loading={<p className="p-5 text-sm text-muted-foreground">読み込み中…</p>}
      >
        {(entries) => {
          const withText = entries.filter(
            (e) => e.assessment.strengths || e.assessment.improvementPoints || e.assessment.comment,
          )
          if (withText.length === 0)
            return <p className="p-5 text-sm text-muted-foreground">コメントはまだありません。</p>
          return (
            <ul className="max-h-[28rem] divide-y overflow-y-auto">
              {withText.map((e) => (
                <li key={e.assessment.id} className="space-y-1.5 px-4 py-3.5 sm:px-5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MessageSquareText className="size-3.5" />
                    <span className="font-medium text-foreground">{e.cycleName}</span>
                    <span>・{e.evaluatorName}</span>
                  </div>
                  {e.assessment.strengths && (
                    <p className="text-sm">
                      <span className="mr-2 text-xs font-medium text-success">強み</span>
                      {e.assessment.strengths}
                    </p>
                  )}
                  {e.assessment.improvementPoints && (
                    <p className="text-sm">
                      <span className="mr-2 text-xs font-medium text-warning">改善点</span>
                      {e.assessment.improvementPoints}
                    </p>
                  )}
                  {e.assessment.comment && (
                    <p className="text-sm text-muted-foreground">{e.assessment.comment}</p>
                  )}
                </li>
              ))}
            </ul>
          )
        }}
      </QueryView>
    </Section>
  )
}

function Content({ detail }: { detail: PlayerDetail }) {
  const { isAdmin } = useMe()
  const archive = useArchivePlayer()
  const [growthMode, setGrowthMode] = useState<'total' | 'category'>('total')
  const { player, results } = detail
  const n = results.length
  const latest = results[n - 1]
  const prev = results[n - 2]
  const latestCriteria = latest ? detail.criteria[latest.criteriaVersionId] : undefined
  const diff = compatibleDiff(detail, latest?.totalScore, prev?.totalScore, n - 1, n - 2)

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/players" className="hover:underline">
            選手
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <span className="num flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-base font-semibold text-primary">
              {player.jerseyNumber ?? '—'}
            </span>
            {player.displayName}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {detail.group?.name ?? '—'}
            <TeamBadge team={detail.currentTeam} emptyLabel="未編成" prefix="所属" />
            {player.status === 'inactive' && <span className="text-xs">退団</span>}
          </span>
        }
        actions={
          isAdmin && (
            <>
              <Button variant="outline" asChild>
                <Link to={`/players/${player.id}/edit`}>
                  <Pencil /> 編集
                </Link>
              </Button>
              {player.status === 'active' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost">
                      <Archive /> 在籍終了
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>在籍を終了しますか？</AlertDialogTitle>
                      <AlertDialogDescription>
                        {player.displayName}
                        さんの在籍状態を「退団」にし、通常の選手一覧から除外します。過去の評価履歴は保持されます。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>キャンセル</AlertDialogCancel>
                      <AlertDialogAction onClick={() => archive.mutate({ id: player.id })}>
                        在籍を終了する
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="最新の総合得点"
          value={formatScore(latest?.totalScore)}
          unit={latest?.totalScore != null ? '/ 100' : undefined}
          hint={latest ? latest.cycleName : '評価なし'}
        />
        <KpiCard
          label="前回評価との差分"
          value={
            <ScoreDelta
              value={diff}
              className="text-[28px] font-semibold sm:text-[32px] [&_svg]:size-6"
            />
          }
          hint={prev ? `前回 ${formatScore(prev.totalScore)}点` : '比較対象なし'}
        />
        <KpiCard
          label="推奨チーム"
          value={<TeamBadge team={latest?.recommendedTeam} />}
          hint={
            latest?.status === 'insufficient' ? '評価者数不足のため未判定' : '最新確定評価に基づく'
          }
        />
        <KpiCard
          label="評価実施回数"
          value={n}
          unit="回"
          hint={results[0] ? `初回 ${formatDate(results[0].cycleEndDate)}` : undefined}
        />
      </div>

      {!latest || !latestCriteria ? (
        <EmptyState
          className="mt-6"
          title="確定した評価がまだありません"
          description="評価期間が確定すると、能力チャートと成長グラフが表示されます。"
        />
      ) : (
        <div className="mt-4 grid gap-4 sm:mt-6 lg:grid-cols-5">
          <Section title="能力バランス" className="lg:col-span-2">
            <Tabs defaultValue="category">
              <TabsList className="mb-3">
                <TabsTrigger value="category">カテゴリ</TabsTrigger>
                <TabsTrigger value="item">9項目</TabsTrigger>
              </TabsList>
              <TabsContent value="category">
                <CategoryRadar detail={detail} criteria={latestCriteria} />
              </TabsContent>
              <TabsContent value="item">
                <ItemRadar detail={detail} criteria={latestCriteria} />
              </TabsContent>
            </Tabs>
          </Section>
          <Section
            title="成長の推移"
            className="lg:col-span-3"
            actions={
              <Tabs value={growthMode} onValueChange={(v) => setGrowthMode(v as typeof growthMode)}>
                <TabsList>
                  <TabsTrigger value="total">総合</TabsTrigger>
                  <TabsTrigger value="category">カテゴリ別</TabsTrigger>
                </TabsList>
              </Tabs>
            }
          >
            <GrowthChart detail={detail} mode={growthMode} />
          </Section>
          <Section
            title="評価項目の詳細"
            description={`${latest.cycleName}（${latestCriteria.version.version}）`}
            className="lg:col-span-3"
          >
            <ItemDetailTable detail={detail} />
          </Section>
          <div className="space-y-4 lg:col-span-2">
            <CoachComments playerId={player.id} />
            <Section title="チーム編成履歴" contentClassName="p-0">
              {detail.teamHistory.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">編成履歴はありません。</p>
              ) : (
                <ol className="relative space-y-0 px-5 py-4">
                  {[...detail.teamHistory].reverse().map((t) => (
                    <li key={t.id} className="relative border-l pb-4 pl-5 last:pb-0">
                      <span
                        className="absolute top-1.5 -left-[5px] size-2.5 rounded-full border-2 border-card bg-brand-accent"
                        aria-hidden
                      />
                      <div className="flex items-center gap-2">
                        <span className="num text-xs text-muted-foreground">
                          {formatDate(t.effectiveDate)}
                        </span>
                        <TeamBadge team={t.assignedTeam} emptyLabel="未編成" size="sm" />
                      </div>
                      {t.reason && <p className="mt-1 text-xs text-muted-foreground">{t.reason}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>
          <Section title="評価履歴" className="lg:col-span-5" contentClassName="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">評価期間</TableHead>
                    <TableHead className="text-right">総合</TableHead>
                    {latestCriteria.categories.map((c) => (
                      <TableHead key={c.categoryKey} className="text-right">
                        {c.name}
                      </TableHead>
                    ))}
                    <TableHead>推奨</TableHead>
                    <TableHead className="text-right">評価者</TableHead>
                    <TableHead className="pr-5">基準</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...results].reverse().map((r) => (
                    <TableRow key={r.cycleId}>
                      <TableCell className="pl-5">
                        <Link to={`/results/${r.cycleId}`} className="font-medium hover:underline">
                          {r.cycleName}
                        </Link>
                      </TableCell>
                      <TableCell className="num text-right font-semibold">
                        {formatScore(r.totalScore)}
                      </TableCell>
                      {latestCriteria.categories.map((c) => (
                        <TableCell key={c.categoryKey} className="num text-right">
                          {formatScore(r.categoryScores[c.categoryKey])}
                        </TableCell>
                      ))}
                      <TableCell>
                        <TeamBadge team={r.recommendedTeam} size="sm" />
                      </TableCell>
                      <TableCell className="num text-right">{r.evaluatorCount}名</TableCell>
                      <TableCell className="pr-5 text-xs text-muted-foreground">
                        {detail.criteria[r.criteriaVersionId]?.version.version}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
        </div>
      )}
    </>
  )
}

export function PlayerDetailPage() {
  const { id = '' } = useParams()
  const query = usePlayer(id)
  return (
    <QueryView query={query} notFoundWhat="選手">
      {(detail) => <Content detail={detail} />}
    </QueryView>
  )
}
