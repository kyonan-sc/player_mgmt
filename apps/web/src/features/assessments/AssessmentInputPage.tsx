import {
  computeScores,
  findMissingItems,
  judgeTeam,
  listItemKeys,
  type Assessment,
  type CycleOverview,
  type ItemScores,
} from '@kyonan/shared'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Send } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Pill, TeamBadge } from '@/components/common/display'
import { NotFoundState, QueryView } from '@/components/states/states'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { useCycleOverview } from '@/features/assessment-cycles/api'
import { isApiError } from '@/lib/api-client'
import { formatDateTime, formatScore } from '@/lib/format'
import { useApiMutation } from '@/lib/query'
import { cn } from '@/lib/utils'
import { draftKey, useDraftStore, type DraftValues } from '@/stores/draft-store'
import { RubricSheet, ScoreSelector } from './ScoreSelector'

type SaveMode = 'draft' | 'submit'

function initialValues(overview: CycleOverview, existing: Assessment | undefined): DraftValues {
  const scores: ItemScores = Object.fromEntries(
    listItemKeys(overview.criteria).map((k) => [k, existing?.scores[k] ?? null]),
  )
  return {
    scores,
    strengths: existing?.strengths ?? '',
    improvementPoints: existing?.improvementPoints ?? '',
    comment: existing?.comment ?? '',
  }
}

function Preview({ overview, scores }: { overview: CycleOverview; scores: ItemScores }) {
  const { criteria } = overview
  const breakdown = computeScores(criteria, scores)
  const missing = findMissingItems(criteria, scores).length
  return (
    <section className="rounded-xl border bg-card p-4 shadow-card sm:p-5" aria-live="polite">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">プレビュー</h2>
        <span className="text-xs text-muted-foreground">この評価のみで計算した参考値</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {criteria.categories.map((c) => {
          const v = breakdown.categoryScores[c.categoryKey]
          return (
            <div key={c.categoryKey} className="rounded-lg bg-muted/60 px-3 py-2">
              <div className="text-xs text-muted-foreground">{c.name}</div>
              <div className="num text-lg font-semibold">
                {v === null || v === undefined ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  formatScore(v)
                )}
                <span className="text-xs font-normal text-muted-foreground"> / {c.weight}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">総合得点</span>
        {breakdown.totalScore === null ? (
          <span className="text-sm text-muted-foreground">あと{missing}項目で表示</span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="num text-2xl font-semibold">{formatScore(breakdown.totalScore)}</span>
            <TeamBadge team={judgeTeam(breakdown.totalScore, criteria.version)} size="sm" />
          </span>
        )}
      </div>
    </section>
  )
}

function AssessmentForm({ overview, playerId }: { overview: CycleOverview; playerId: string }) {
  const navigate = useNavigate()
  const { cycle, criteria } = overview
  const index = overview.players.findIndex((p) => p.player.id === playerId)
  const progress = overview.players[index]!
  const prevPlayer = overview.players[index - 1]
  const nextPlayer = overview.players[index + 1]
  const existing = overview.myAssessments.find((a) => a.playerId === playerId)
  const key = draftKey(cycle.id, playerId)
  const readOnly = cycle.status !== 'open'

  const stashed = useDraftStore((s) => s.drafts[key])
  const { stash, discard } = useDraftStore()
  const [revision, setRevision] = useState<number | null>(existing?.revision ?? null)
  const [status, setStatus] = useState(existing?.status ?? null)
  const [conflict, setConflict] = useState(false)
  const allowLeave = useRef(false)

  const defaults = useMemo(() => initialValues(overview, existing), [overview, existing])
  const form = useForm<DraftValues>({ defaultValues: stashed ?? defaults })
  const scores = useWatch({ control: form.control, name: 'scores' })
  const values = useWatch({ control: form.control })
  const { isDirty } = form.formState
  const dirty = isDirty || (stashed !== undefined && !readOnly)

  // 再ログイン後の復元を通知
  useEffect(() => {
    if (stashed) toast.info('保存されていない入力を復元しました')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回表示時のみ
  }, [])

  // 未保存の入力をメモリ上に退避（ログイン期限切れ対策）
  useEffect(() => {
    if (isDirty && !readOnly) stash(key, form.getValues())
  }, [values, isDirty, readOnly, key, stash, form])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !allowLeave.current && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const save = useApiMutation('assessments.save', { silentError: true })
  const submit = useApiMutation('assessments.submit', { silentError: true })
  const pending = save.isPending || submit.isPending

  const filled = Object.values(scores ?? {}).filter((v) => v !== null).length
  const total = listItemKeys(criteria).length
  const complete = filled === total

  const run = (mode: SaveMode, goNext: boolean) => {
    const v = form.getValues()
    const mutation = mode === 'submit' ? submit : save
    mutation.mutate(
      { cycleId: cycle.id, playerId, ...v, expectedRevision: revision },
      {
        onSuccess: (saved) => {
          setRevision(saved.revision)
          setStatus(saved.status)
          form.reset(v)
          discard(key)
          toast.success(mode === 'submit' ? '評価を提出しました' : '下書きを保存しました')
          if (goNext && nextPlayer) {
            allowLeave.current = true
            void navigate(`/assessments/${cycle.id}/players/${nextPlayer.player.id}`)
          } else if (goNext) {
            allowLeave.current = true
            void navigate(`/assessments/${cycle.id}`)
          }
        },
        onError: (error) => {
          // 入力値は保持したまま再試行できるようにする
          if (isApiError(error, 'CONFLICT')) {
            setConflict(true)
            return
          }
          if (isApiError(error, 'UNAUTHENTICATED')) {
            stash(key, v)
            return
          }
          toast.error(error.message, {
            action: { label: '再試行', onClick: () => run(mode, goNext) },
            duration: 10_000,
          })
        },
      },
    )
  }

  const goTo = (id: string) => void navigate(`/assessments/${cycle.id}/players/${id}`)

  return (
    <div className="relative">
      {/* ヘッダー：選手・評価期間・入力進捗・前後の選手 */}
      <div className="sticky top-14 z-10 -mx-4 mb-4 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild aria-label="評価期間に戻る">
            <Link to={`/assessments/${cycle.id}`}>
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="num text-sm text-muted-foreground">
                #{progress.player.jerseyNumber ?? '—'}
              </span>
              <h1 className="truncate text-lg font-semibold">{progress.player.displayName}</h1>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {cycle.name}・{index + 1}/{overview.players.length}人目
            </p>
          </div>
          <div className="text-right">
            <div
              className="num text-sm font-semibold"
              aria-label={`入力済み ${filled} / ${total}項目`}
            >
              {filled}
              <span className="text-muted-foreground">/{total}</span>
            </div>
            {status && (
              <Pill
                tone={status === 'submitted' ? 'success' : 'warning'}
                className="h-5 text-[11px]"
              >
                {status === 'submitted' && !isDirty ? '提出済み' : '下書き'}
              </Pill>
            )}
          </div>
          <div className="flex">
            <Button
              variant="ghost"
              size="icon"
              disabled={!prevPlayer}
              onClick={() => prevPlayer && goTo(prevPlayer.player.id)}
              aria-label="前の選手"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={!nextPlayer}
              onClick={() => nextPlayer && goTo(nextPlayer.player.id)}
              aria-label="次の選手"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-primary transition-all duration-200"
            style={{ width: `${(filled / total) * 100}%` }}
          />
        </div>
      </div>

      {readOnly && (
        <div className="mb-4 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
          {cycle.status === 'finalized'
            ? 'この評価期間は確定済みのため、評価内容は変更できません。'
            : 'この評価期間はまだ開始されていません。'}
        </div>
      )}
      {status === 'submitted' && isDirty && !readOnly && (
        <div className="mb-4 rounded-lg bg-warning/10 p-3 text-sm text-warning" role="status">
          提出済みの評価を変更しています。変更後は再度「提出」してください（下書き保存すると未提出に戻ります）。
        </div>
      )}

      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        {criteria.categories.map((category) => (
          <section key={category.id} className="rounded-xl border bg-card shadow-card">
            <header className="flex items-baseline justify-between border-b px-4 py-3">
              <h2 className="font-semibold">{category.name}</h2>
              <span className="num text-xs text-muted-foreground">配点 {category.weight}点</span>
            </header>
            <ul className="divide-y">
              {category.items.map((item) => (
                <li key={item.itemKey} className="px-4 py-3.5">
                  <div className="mb-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {scores?.[item.itemKey] == null && (
                          <span className="text-[11px] text-muted-foreground">未評価</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    <RubricSheet item={item} selected={scores?.[item.itemKey] ?? null} />
                  </div>
                  <Controller
                    control={form.control}
                    name={`scores.${item.itemKey}`}
                    render={({ field }) => (
                      <ScoreSelector
                        item={item}
                        value={field.value ?? null}
                        onChange={field.onChange}
                        disabled={readOnly || pending}
                      />
                    )}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-card">
          <h2 className="font-semibold">コメント（任意）</h2>
          {(
            [
              ['strengths', '強み', '例：ボールを受ける前に周囲を確認できている'],
              ['improvementPoints', '改善点', '例：逆足でのトラップ'],
              ['comment', 'その他コメント', ''],
            ] as const
          ).map(([name, label, placeholder]) => (
            <Field key={name}>
              <FieldLabel htmlFor={name}>{label}</FieldLabel>
              <Textarea
                id={name}
                rows={2}
                maxLength={2000}
                placeholder={placeholder}
                disabled={readOnly}
                className="text-base"
                {...form.register(name)}
              />
            </Field>
          ))}
        </section>

        <Preview overview={overview} scores={scores ?? {}} />
        {existing && (
          <p className="text-center text-xs text-muted-foreground">
            最終保存 {formatDateTime(existing.updatedAt)}
          </p>
        )}
      </form>

      {/* 固定フッター：保存操作（スマートフォン画面下部、Safe Area 対応） */}
      {!readOnly && (
        <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)] gap-2 [&_button]:px-2 sm:[&_button]:px-4">
            <Button
              variant="outline"
              size="lg"
              disabled={pending || !dirty}
              onClick={() => run('draft', false)}
            >
              {save.isPending && <Loader2 className="animate-spin" />}
              下書き<span className="hidden sm:inline">保存</span>
            </Button>
            <Button
              variant="secondary"
              size="lg"
              disabled={pending || !complete}
              onClick={() => run('submit', false)}
            >
              {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              提出
            </Button>
            <Button
              size="lg"
              disabled={pending || (!dirty && !complete)}
              onClick={() => run(complete ? 'submit' : 'draft', true)}
            >
              {complete ? '提出して次へ' : '保存して次へ'}
              <ChevronRight />
            </Button>
          </div>
          {!complete && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              提出には全{total}項目の評価が必要です（残り{total - filled}項目）
            </p>
          )}
        </div>
      )}

      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>保存されていない変更があります</AlertDialogTitle>
            <AlertDialogDescription>
              このまま移動すると、入力した内容は失われます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>入力に戻る</AlertDialogCancel>
            <AlertDialogAction
              className={cn('bg-destructive text-white hover:bg-destructive/90')}
              onClick={() => {
                discard(key)
                blocker.proceed?.()
              }}
            >
              破棄して移動
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={conflict}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>評価が別の画面で更新されています</AlertDialogTitle>
            <AlertDialogDescription>
              他の端末やタブでこの選手の評価が保存されました。最新の内容を読み込み直してから入力してください。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConflict(false)}>閉じる</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                discard(key)
                allowLeave.current = true
                window.location.reload()
              }}
            >
              最新を読み込む
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function AssessmentInputPage() {
  const { cycleId = '', playerId = '' } = useParams()
  const query = useCycleOverview(cycleId)
  return (
    <QueryView query={query} notFoundWhat="評価期間">
      {(overview) =>
        overview.players.some((p) => p.player.id === playerId) ? (
          // 選手ごとにフォームを作り直し、初期値を確実に反映する
          <AssessmentForm key={`${cycleId}:${playerId}`} overview={overview} playerId={playerId} />
        ) : (
          <NotFoundState what="評価対象の選手" />
        )
      }
    </QueryView>
  )
}
