import { zodResolver } from '@hookform/resolvers/zod'
import { coachInputSchema, type CoachWithGroups, type Group, type Role } from '@kyonan/shared'
import { CheckCircle2, CircleDashed, Loader2, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { PageHeader, Pill } from '@/components/common/display'
import { EmptyState, QueryView } from '@/components/states/states'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useGroups } from '@/features/players/api'
import { useApiMutation, useApiQuery } from '@/lib/query'

const ROLE_LABEL: Record<Role, string> = { admin: '管理者', coach: 'コーチ', viewer: '閲覧者' }
const ROLE_DESC: Record<Role, string> = {
  admin: '全機能・ユーザー管理・設定・評価確定',
  coach: '担当学年の選手閲覧・評価入力・自分の評価の編集',
  viewer: '担当学年の確定済み結果の閲覧のみ',
}

const schema = coachInputSchema.extend({ status: z.enum(['active', 'inactive']) })
type Values = z.infer<typeof schema>

function CoachDialog({
  target,
  groups,
  onClose,
}: {
  target: CoachWithGroups | 'new'
  groups: Group[]
  onClose: () => void
}) {
  const isNew = target === 'new'
  const create = useApiMutation('coaches.create', {
    successMessage: 'コーチを登録しました',
    onSuccess: onClose,
  })
  const update = useApiMutation('coaches.update', {
    successMessage: 'コーチ情報を更新しました',
    onSuccess: onClose,
  })
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: isNew
      ? { email: '', displayName: '', role: 'coach', groupIds: [], status: 'active' }
      : {
          email: target.coach.email,
          displayName: target.coach.displayName,
          role: target.coach.role,
          groupIds: target.groupIds,
          status: target.coach.status,
        },
  })
  const role = useWatch({ control: form.control, name: 'role' })
  const pending = create.isPending || update.isPending
  const err = form.formState.errors
  const onSubmit = form.handleSubmit(({ status, ...input }) => {
    if (isNew) create.mutate(input)
    else update.mutate({ ...input, id: target.coach.id, status })
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? 'コーチを登録' : 'コーチ情報を編集'}</DialogTitle>
          <DialogDescription>
            登録したGoogleアカウントで初回ログインすると、アカウントが紐付けられます。
          </DialogDescription>
        </DialogHeader>
        <form id="coach-form" onSubmit={(e) => void onSubmit(e)} noValidate>
          <FieldGroup className="gap-4">
            <Field data-invalid={!!err.displayName}>
              <FieldLabel htmlFor="coach-name">氏名</FieldLabel>
              <Input id="coach-name" {...form.register('displayName')} />
              <FieldError errors={[err.displayName]} />
            </Field>
            <Field data-invalid={!!err.email}>
              <FieldLabel htmlFor="coach-email">Googleアカウントのメールアドレス</FieldLabel>
              <Input id="coach-email" type="email" autoComplete="off" {...form.register('email')} />
              {!isNew && (
                <FieldDescription>
                  変更すると Google アカウントとの紐付けが解除され、次回ログイン時に再照合されます。
                </FieldDescription>
              )}
              <FieldError errors={[err.email]} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="coach-role">ロール</FieldLabel>
                <Controller
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="coach-role" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>{ROLE_DESC[role]}</FieldDescription>
              </Field>
              {!isNew && (
                <Field>
                  <FieldLabel htmlFor="coach-status">アカウント</FieldLabel>
                  <Controller
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="coach-status" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">有効</SelectItem>
                          <SelectItem value="inactive">無効</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              )}
            </div>
            <FieldSet>
              <FieldLegend variant="label">担当学年</FieldLegend>
              <Controller
                control={form.control}
                name="groupIds"
                render={({ field }) => (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {groups.map((g) => {
                      const checked = field.value.includes(g.id)
                      return (
                        <label
                          key={g.id}
                          className="flex min-h-11 items-center gap-2.5 rounded-lg border px-3 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              field.onChange(
                                v
                                  ? [...field.value, g.id]
                                  : field.value.filter((id) => id !== g.id),
                              )
                            }
                          />
                          {g.name}
                        </label>
                      )
                    })}
                  </div>
                )}
              />
              <FieldDescription>管理者は担当に関わらず全学年にアクセスできます。</FieldDescription>
            </FieldSet>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" form="coach-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {isNew ? '登録' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CoachesPage() {
  const query = useApiQuery('coaches.list', {})
  const groups = useGroups()
  const [target, setTarget] = useState<CoachWithGroups | 'new' | null>(null)
  const groupName = new Map(groups.data?.map((g) => [g.id, g.name]))

  return (
    <>
      <PageHeader
        title="コーチ管理"
        description="アプリを利用できるのは、ここに登録された有効なアカウントのみです。"
        actions={
          <Button onClick={() => setTarget('new')} disabled={!groups.data}>
            <Plus /> コーチを登録
          </Button>
        }
      />
      <QueryView query={query}>
        {(coaches) =>
          coaches.length === 0 ? (
            <EmptyState title="コーチが登録されていません" />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-5">氏名</TableHead>
                    <TableHead>メールアドレス</TableHead>
                    <TableHead>ロール</TableHead>
                    <TableHead>担当学年</TableHead>
                    <TableHead>状態</TableHead>
                    <TableHead className="pr-5 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coaches.map((c) => (
                    <TableRow key={c.coach.id}>
                      <TableCell className="pl-5 font-medium">{c.coach.displayName}</TableCell>
                      <TableCell className="text-muted-foreground">{c.coach.email}</TableCell>
                      <TableCell>
                        <Pill tone={c.coach.role === 'admin' ? 'primary' : 'neutral'}>
                          {ROLE_LABEL[c.coach.role]}
                        </Pill>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.coach.role === 'admin' ? (
                          <span className="text-muted-foreground">全学年</span>
                        ) : (
                          c.groupIds.map((id) => groupName.get(id) ?? id).join('、') || '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Pill tone={c.coach.status === 'active' ? 'success' : 'neutral'}>
                            {c.coach.status === 'active' ? '有効' : '無効'}
                          </Pill>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            {c.coach.linked ? (
                              <CheckCircle2 className="size-3" />
                            ) : (
                              <CircleDashed className="size-3" />
                            )}
                            {c.coach.linked ? 'ログイン済み' : '未ログイン'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTarget(c)}
                          disabled={!groups.data}
                        >
                          <Pencil /> 編集
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        }
      </QueryView>
      {target && groups.data && (
        <CoachDialog target={target} groups={groups.data} onClose={() => setTarget(null)} />
      )}
    </>
  )
}
