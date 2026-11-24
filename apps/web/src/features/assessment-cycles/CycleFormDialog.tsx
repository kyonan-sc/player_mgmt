import { zodResolver } from '@hookform/resolvers/zod'
import { DEFAULT_MIN_EVALUATOR_COUNT, type AssessmentCycle } from '@kyonan/shared'
import { Loader2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCriteriaList, useGroups } from '@/features/players/api'
import { useCreateCycle, useSettings, useUpdateCycle } from './api'

const schema = z
  .object({
    groupId: z.string().min(1, '対象グループを選択してください'),
    name: z.string().trim().min(1, '評価期間名を入力してください').max(100),
    startDate: z.string().min(1, '開始日を入力してください'),
    endDate: z.string().min(1, '終了日を入力してください'),
    criteriaVersionId: z.string().min(1, '評価基準を選択してください'),
    minEvaluatorCount: z.coerce
      .number<string | number>()
      .int('整数で入力してください')
      .min(1, '1以上')
      .max(20, '20以下'),
  })
  .refine((v) => v.startDate <= v.endDate, {
    path: ['endDate'],
    message: '終了日は開始日以降にしてください',
  })
type Values = z.infer<typeof schema>

export function CycleFormDialog({
  cycle,
  trigger,
}: {
  cycle?: AssessmentCycle
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const groups = useGroups()
  const criteria = useCriteriaList()
  const settings = useSettings()
  const create = useCreateCycle()
  const update = useUpdateCycle()
  const pending = create.isPending || update.isPending
  const locked = cycle?.status === 'open'

  const form = useForm<z.input<typeof schema>, unknown, Values>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!open) return
    const latestCriteria = criteria.data?.[criteria.data.length - 1]?.version.id ?? ''
    form.reset({
      groupId: cycle?.groupId ?? groups.data?.[0]?.id ?? '',
      name: cycle?.name ?? '',
      startDate: cycle?.startDate ?? '',
      endDate: cycle?.endDate ?? '',
      criteriaVersionId:
        cycle?.criteriaVersionId ?? settings.data?.defaultCriteriaVersionId ?? latestCriteria,
      minEvaluatorCount:
        cycle?.minEvaluatorCount ??
        settings.data?.defaultMinEvaluatorCount ??
        DEFAULT_MIN_EVALUATOR_COUNT,
    })
  }, [open, cycle, groups.data, criteria.data, settings.data, form])

  const onSubmit = form.handleSubmit((values) => {
    const done = { onSuccess: () => setOpen(false) }
    if (cycle) update.mutate({ id: cycle.id, input: values }, done)
    else create.mutate(values, done)
  })
  const err = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{cycle ? '評価期間を編集' : '評価期間を作成'}</DialogTitle>
          <DialogDescription>
            作成後に「評価開始」を行うと、その時点の在籍選手が評価対象として固定されます。
          </DialogDescription>
        </DialogHeader>
        <form id="cycle-form" onSubmit={(e) => void onSubmit(e)} noValidate>
          <FieldGroup className="gap-4">
            <Field data-invalid={!!err.name}>
              <FieldLabel htmlFor="cycle-name">評価期間名</FieldLabel>
              <Input id="cycle-name" placeholder="例：2026年12月評価" {...form.register('name')} />
              <FieldError errors={[err.name]} />
            </Field>
            <Field data-invalid={!!err.groupId}>
              <FieldLabel htmlFor="cycle-group">対象グループ</FieldLabel>
              <Controller
                control={form.control}
                name="groupId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={locked}>
                    <SelectTrigger id="cycle-group" className="w-full">
                      <SelectValue placeholder="選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.data?.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[err.groupId]} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!err.startDate}>
                <FieldLabel htmlFor="cycle-start">開始日</FieldLabel>
                <Input id="cycle-start" type="date" {...form.register('startDate')} />
                <FieldError errors={[err.startDate]} />
              </Field>
              <Field data-invalid={!!err.endDate}>
                <FieldLabel htmlFor="cycle-end">終了日</FieldLabel>
                <Input id="cycle-end" type="date" {...form.register('endDate')} />
                <FieldError errors={[err.endDate]} />
              </Field>
            </div>
            <Field data-invalid={!!err.criteriaVersionId}>
              <FieldLabel htmlFor="cycle-criteria">評価基準</FieldLabel>
              <Controller
                control={form.control}
                name="criteriaVersionId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={locked}>
                    <SelectTrigger id="cycle-criteria" className="w-full">
                      <SelectValue placeholder="選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      {criteria.data?.map((c) => (
                        <SelectItem key={c.version.id} value={c.version.id}>
                          {c.version.version}（{c.version.name}）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {locked && (
                <FieldDescription>
                  評価開始後は対象グループと評価基準を変更できません。
                </FieldDescription>
              )}
            </Field>
            <Field data-invalid={!!err.minEvaluatorCount}>
              <FieldLabel htmlFor="cycle-min">必要評価者数</FieldLabel>
              <Input
                id="cycle-min"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                className="w-28"
                {...form.register('minEvaluatorCount')}
              />
              <FieldDescription>
                この人数に満たない選手は「評価不足」となり、チーム判定を行いません。
              </FieldDescription>
              <FieldError errors={[err.minEvaluatorCount]} />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            キャンセル
          </Button>
          <Button type="submit" form="cycle-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {cycle ? '保存' : '作成'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
