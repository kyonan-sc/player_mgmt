import { zodResolver } from '@hookform/resolvers/zod'
import {
  criteriaVersionInputSchema,
  type CriteriaDefinition,
  type CriteriaVersionInput,
} from '@kyonan/shared'
import { ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type UseFormRegister,
} from 'react-hook-form'
import { PageHeader, Pill, Section } from '@/components/common/display'
import { EmptyState, QueryView } from '@/components/states/states'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useMe } from '@/features/auth/use-me'
import { useCriteriaList } from '@/features/players/api'
import { formatDate } from '@/lib/format'
import { useApiMutation } from '@/lib/query'
import { cn } from '@/lib/utils'

function toInput(c: CriteriaDefinition, nextVersion: string): CriteriaVersionInput {
  return {
    version: nextVersion,
    name: c.version.name,
    thresholdA: c.version.thresholdA,
    thresholdB: c.version.thresholdB,
    categories: c.categories.map((cat) => ({
      categoryKey: cat.categoryKey,
      name: cat.name,
      weight: cat.weight,
      items: cat.items.map((i) => ({
        itemKey: i.itemKey,
        name: i.name,
        description: i.description,
        maxScore: i.maxScore === 3 ? 3 : 5,
        allowUnobserved: i.allowUnobserved === true,
        rubric: i.rubric,
      })),
    })),
  }
}

function nextVersionLabel(list: CriteriaDefinition[]): string {
  const max = list.reduce(
    (m, c) => Math.max(m, Number(c.version.version.replace(/\D/g, '')) || 0),
    0,
  )
  return `v${max + 1}`
}

function CriteriaView({ c, latest }: { c: CriteriaDefinition; latest: boolean }) {
  const [open, setOpen] = useState(latest)
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{c.version.version}</span>
            <span className="truncate text-sm">{c.version.name}</span>
            {latest && <Pill tone="primary">最新</Pill>}
          </div>
          <div className="num mt-0.5 text-xs text-muted-foreground">
            作成 {formatDate(c.version.createdAt)}・A ≧ {c.version.thresholdA}・B ≧{' '}
            {c.version.thresholdB}
          </div>
        </div>
        <ChevronDown
          className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="grid gap-3 border-t p-4 sm:p-5 lg:grid-cols-2">
          {c.categories.map((cat) => (
            <div key={cat.id} className="rounded-lg border">
              <div className="flex items-baseline justify-between border-b bg-muted/40 px-3 py-2">
                <span className="text-sm font-semibold">{cat.name}</span>
                <span className="num text-xs text-muted-foreground">{cat.weight}点</span>
              </div>
              <ul className="divide-y">
                {cat.items.map((item) => (
                  <li key={item.id} className="px-3 py-2.5 text-sm">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-[11px] text-muted-foreground">{item.itemKey}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                    {(item.maxScore === 3 || item.allowUnobserved) && (
                      <div className="mt-1 flex gap-1">
                        {item.maxScore === 3 && <Pill tone="neutral">3段階</Pill>}
                        {item.allowUnobserved && <Pill tone="neutral">未観察あり</Pill>}
                      </div>
                    )}
                    <dl className="mt-1.5 grid gap-0.5 text-xs">
                      {(item.maxScore === 3
                        ? (['3', '2', '1'] as const)
                        : (['5', '3', '1'] as const)
                      ).map((lv) => (
                        <div key={lv} className="flex gap-2">
                          <dt className="num w-10 shrink-0 whitespace-nowrap font-semibold">
                            {lv}点
                          </dt>
                          <dd className="text-muted-foreground">{item.rubric[lv] ?? '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** 段階数（5段階／3段階）、未観察の許可、各段階の目安。段階数に応じて目安の入力欄が変わる */
function ItemScale({
  control,
  register,
  ci,
  ii,
}: {
  control: Control<CriteriaVersionInput>
  register: UseFormRegister<CriteriaVersionInput>
  ci: number
  ii: number
}) {
  const maxScore = useWatch({ control, name: `categories.${ci}.items.${ii}.maxScore` })
  const levels = maxScore === 3 ? (['1', '2', '3'] as const) : (['1', '3', '5'] as const)
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          段階
          <select
            aria-label="段階数"
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
            {...register(`categories.${ci}.items.${ii}.maxScore`, { valueAsNumber: true })}
          >
            <option value={5}>5段階</option>
            <option value={3}>3段階</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            {...register(`categories.${ci}.items.${ii}.allowUnobserved`)}
          />
          未観察を許可（未入力でも提出でき、平均に含めない）
        </label>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {levels.map((lv) => (
          <Textarea
            key={lv}
            rows={2}
            aria-label={`${lv}点の目安`}
            placeholder={`${lv}点の目安`}
            {...register(`categories.${ci}.items.${ii}.rubric.${lv}`)}
          />
        ))}
      </div>
    </>
  )
}

function ItemsEditor({
  control,
  register,
  ci,
}: {
  control: Control<CriteriaVersionInput>
  register: UseFormRegister<CriteriaVersionInput>
  ci: number
}) {
  const { fields, append, remove } = useFieldArray({ control, name: `categories.${ci}.items` })
  return (
    <div className="space-y-3">
      {fields.map((f, ii) => (
        <div key={f.id} className="rounded-lg border bg-background p-3">
          <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
            <Input
              aria-label="項目キー"
              placeholder="TEC-01"
              {...register(`categories.${ci}.items.${ii}.itemKey`)}
            />
            <Input
              aria-label="項目名"
              placeholder="項目名"
              {...register(`categories.${ci}.items.${ii}.name`)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="項目を削除"
              onClick={() => remove(ii)}
              disabled={fields.length <= 1}
            >
              <Trash2 />
            </Button>
          </div>
          <Input
            className="mt-2"
            aria-label="評価内容"
            placeholder="評価内容"
            {...register(`categories.${ci}.items.${ii}.description`)}
          />
          <ItemScale control={control} register={register} ci={ci} ii={ii} />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          append({
            itemKey: '',
            name: '',
            description: '',
            maxScore: 5,
            allowUnobserved: false,
            rubric: {},
          })
        }
      >
        <Plus /> 項目を追加
      </Button>
    </div>
  )
}

function CriteriaEditor({ base, onClose }: { base: CriteriaVersionInput; onClose: () => void }) {
  const create = useApiMutation('criteria.createVersion', {
    successMessage: '新しい評価基準を作成しました',
    onSuccess: onClose,
  })
  const form = useForm<CriteriaVersionInput>({
    resolver: zodResolver(criteriaVersionInputSchema),
    defaultValues: base,
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'categories' })
  const categories = useWatch({ control: form.control, name: 'categories' })
  const sum = (categories ?? []).reduce((a, c) => a + (Number(c?.weight) || 0), 0)
  const err = form.formState.errors

  return (
    <form
      onSubmit={(e) => void form.handleSubmit((v) => create.mutate(v))(e)}
      className="space-y-4"
      noValidate
    >
      <Section
        title="新しい評価基準バージョン"
        description="既存の基準は上書きされません。評価期間の作成時に使用する基準を選択します。"
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Field data-invalid={!!err.version}>
            <FieldLabel htmlFor="version">バージョン</FieldLabel>
            <Input id="version" {...form.register('version')} />
            <FieldError errors={[err.version]} />
          </Field>
          <Field className="sm:col-span-3" data-invalid={!!err.name}>
            <FieldLabel htmlFor="cname">名称</FieldLabel>
            <Input id="cname" {...form.register('name')} />
            <FieldError errors={[err.name]} />
          </Field>
          <Field data-invalid={!!err.thresholdA}>
            <FieldLabel htmlFor="ta">A判定の下限</FieldLabel>
            <Input
              id="ta"
              type="number"
              step="0.1"
              {...form.register('thresholdA', { valueAsNumber: true })}
            />
          </Field>
          <Field data-invalid={!!err.thresholdB}>
            <FieldLabel htmlFor="tb">B判定の下限</FieldLabel>
            <Input
              id="tb"
              type="number"
              step="0.1"
              {...form.register('thresholdB', { valueAsNumber: true })}
            />
          </Field>
          <div className="flex items-end sm:col-span-2">
            <p
              className={cn(
                'num rounded-lg px-3 py-2 text-sm',
                sum === 100 ? 'bg-success/8 text-success' : 'bg-destructive/8 text-destructive',
              )}
              role="status"
            >
              配点合計 {sum} / 100点
            </p>
          </div>
        </div>
      </Section>
      {fields.map((f, ci) => (
        <Section
          key={f.id}
          title={categories?.[ci]?.name || `カテゴリ ${ci + 1}`}
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(ci)}
              disabled={fields.length <= 1}
            >
              <Trash2 /> 削除
            </Button>
          }
        >
          <div className="mb-3 grid gap-2 sm:grid-cols-[120px_1fr_120px]">
            <Input
              aria-label="カテゴリキー"
              placeholder="TEC"
              {...form.register(`categories.${ci}.categoryKey`)}
            />
            <Input
              aria-label="カテゴリ名"
              placeholder="カテゴリ名"
              {...form.register(`categories.${ci}.name`)}
            />
            <Input
              aria-label="配点"
              type="number"
              {...form.register(`categories.${ci}.weight`, { valueAsNumber: true })}
            />
          </div>
          <ItemsEditor control={form.control} register={form.register} ci={ci} />
        </Section>
      ))}
      {Object.keys(err).length > 0 && (
        <p role="alert" className="rounded-lg bg-destructive/8 p-3 text-sm text-destructive">
          入力内容を確認してください（キーは英大文字、名称は必須です）。
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            append({
              categoryKey: '',
              name: '',
              weight: 0,
              items: [
                {
                  itemKey: '',
                  name: '',
                  description: '',
                  maxScore: 5,
                  allowUnobserved: false,
                  rubric: {},
                },
              ],
            })
          }
        >
          <Plus /> カテゴリを追加
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" disabled={create.isPending || sum !== 100}>
            {create.isPending && <Loader2 className="animate-spin" />}作成する
          </Button>
        </div>
      </div>
    </form>
  )
}

export function CriteriaPage() {
  const { isAdmin } = useMe()
  const query = useCriteriaList()
  const [editing, setEditing] = useState<CriteriaVersionInput | null>(null)
  return (
    <>
      <PageHeader
        title="評価基準"
        description={
          isAdmin
            ? '評価カテゴリ・配点・評価項目・A/B判定閾値。変更は新しいバージョンとして保存され、過去の結果は再計算されません。'
            : '評価カテゴリ・配点・評価項目・A/B判定閾値の一覧です（閲覧のみ）。変更は管理者が行います。'
        }
        actions={
          isAdmin &&
          !editing &&
          query.data &&
          query.data.length > 0 && (
            <Button
              onClick={() =>
                setEditing(
                  toInput(query.data[query.data.length - 1]!, nextVersionLabel(query.data)),
                )
              }
            >
              <Plus /> 新しいバージョンを作成
            </Button>
          )
        }
      />
      {editing ? (
        <CriteriaEditor base={editing} onClose={() => setEditing(null)} />
      ) : (
        <QueryView query={query}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                title="評価基準がありません"
                description="GAS の setupSheets を実行すると初期評価基準が登録されます。"
              />
            ) : (
              <div className="space-y-3">
                {[...list].reverse().map((c, i) => (
                  <CriteriaView key={c.version.id} c={c} latest={i === 0} />
                ))}
              </div>
            )
          }
        </QueryView>
      )}
    </>
  )
}
