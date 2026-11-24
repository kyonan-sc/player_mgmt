import { zodResolver } from '@hookform/resolvers/zod'
import type { Player, PlayerInput } from '@kyonan/shared'
import { Loader2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { PageHeader } from '@/components/common/display'
import { QueryView } from '@/components/states/states'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreatePlayer, useGroups, usePlayer, useUpdatePlayer } from './api'

const optionalInt = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), message)

const formSchema = z.object({
  displayName: z.string().trim().min(1, '選手名を入力してください').max(100),
  jerseyNumber: optionalInt(0, 999, '0〜999の数字で入力してください'),
  groupId: z.string().min(1, '所属学年グループを選択してください'),
  enrollmentGrade: optionalInt(1, 6, '1〜6で入力してください'),
  enrollmentYear: optionalInt(2000, 2100, '西暦4桁で入力してください'),
  joinedDate: z.string(),
  status: z.enum(['active', 'inactive']),
})
type FormValues = z.infer<typeof formSchema>

const toNumber = (v: string) => (v.trim() === '' ? null : Number(v))

function toInput(v: FormValues): PlayerInput {
  return {
    displayName: v.displayName.trim(),
    jerseyNumber: toNumber(v.jerseyNumber),
    groupId: v.groupId,
    enrollmentGrade: toNumber(v.enrollmentGrade),
    enrollmentYear: toNumber(v.enrollmentYear),
    joinedDate: v.joinedDate || null,
    status: v.status,
  }
}

function fromPlayer(p?: Player): FormValues {
  return {
    displayName: p?.displayName ?? '',
    jerseyNumber: p?.jerseyNumber?.toString() ?? '',
    groupId: p?.groupId ?? '',
    enrollmentGrade: p?.enrollmentGrade?.toString() ?? '',
    enrollmentYear: p?.enrollmentYear?.toString() ?? '',
    joinedDate: p?.joinedDate ?? '',
    status: p?.status ?? 'active',
  }
}

function PlayerForm({ player }: { player?: Player }) {
  const navigate = useNavigate()
  const groups = useGroups()
  const create = useCreatePlayer()
  const update = useUpdatePlayer()
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: fromPlayer(player),
  })
  const pending = create.isPending || update.isPending

  const onSubmit = form.handleSubmit((values) => {
    const input = toInput(values)
    if (player) {
      update.mutate(
        { ...input, id: player.id, expectedUpdatedAt: player.updatedAt },
        { onSuccess: (p) => void navigate(`/players/${p.id}`) },
      )
    } else {
      create.mutate(input, { onSuccess: (p) => void navigate(`/players/${p.id}`) })
    }
  })

  const err = form.formState.errors
  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="max-w-2xl rounded-xl border bg-card p-5 shadow-card sm:p-6"
      noValidate
    >
      <FieldGroup>
        <Field data-invalid={!!err.displayName}>
          <FieldLabel htmlFor="displayName">
            選手名または表示名 <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="displayName"
            autoComplete="off"
            aria-invalid={!!err.displayName}
            {...form.register('displayName')}
          />
          <FieldDescription>住所・電話番号・生年月日などは登録しません。</FieldDescription>
          <FieldError errors={[err.displayName]} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!err.jerseyNumber}>
            <FieldLabel htmlFor="jerseyNumber">背番号</FieldLabel>
            <Input
              id="jerseyNumber"
              inputMode="numeric"
              aria-invalid={!!err.jerseyNumber}
              {...form.register('jerseyNumber')}
            />
            <FieldError errors={[err.jerseyNumber]} />
          </Field>
          <Field data-invalid={!!err.groupId}>
            <FieldLabel htmlFor="groupId">
              所属学年グループ <span className="text-destructive">*</span>
            </FieldLabel>
            <Controller
              control={form.control}
              name="groupId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="groupId" className="w-full" aria-invalid={!!err.groupId}>
                    <SelectValue
                      placeholder={groups.isPending ? '読み込み中…' : '選択してください'}
                    />
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
          <Field data-invalid={!!err.enrollmentGrade}>
            <FieldLabel htmlFor="enrollmentGrade">入団時の学年</FieldLabel>
            <Input
              id="enrollmentGrade"
              inputMode="numeric"
              placeholder="例：1"
              {...form.register('enrollmentGrade')}
            />
            <FieldError errors={[err.enrollmentGrade]} />
          </Field>
          <Field data-invalid={!!err.enrollmentYear}>
            <FieldLabel htmlFor="enrollmentYear">入団年度</FieldLabel>
            <Input
              id="enrollmentYear"
              inputMode="numeric"
              placeholder="例：2024"
              {...form.register('enrollmentYear')}
            />
            <FieldError errors={[err.enrollmentYear]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="joinedDate">入団日</FieldLabel>
            <Input id="joinedDate" type="date" {...form.register('joinedDate')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="status">在籍状態</FieldLabel>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">在籍中</SelectItem>
                    <SelectItem value="inactive">退団</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
      </FieldGroup>
      <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" asChild>
          <Link to={player ? `/players/${player.id}` : '/players'}>キャンセル</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {player ? '更新する' : '登録する'}
        </Button>
      </div>
    </form>
  )
}

export function PlayerFormPage() {
  const { id } = useParams()
  if (!id) {
    return (
      <>
        <PageHeader title="選手を登録" description="選手IDは自動で採番されます" />
        <PlayerForm />
      </>
    )
  }
  return <EditPlayer id={id} />
}

function EditPlayer({ id }: { id: string }) {
  const query = usePlayer(id)
  return (
    <QueryView query={query} notFoundWhat="選手">
      {(detail) => (
        <>
          <PageHeader title="選手情報を編集" eyebrow={detail.player.displayName} />
          <PlayerForm player={detail.player} />
        </>
      )}
    </QueryView>
  )
}
