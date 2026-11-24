import { zodResolver } from '@hookform/resolvers/zod'
import { groupInputSchema, settingsInputSchema, type AppSettings, type Group } from '@kyonan/shared'
import { Activity, Loader2, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { PageHeader, Pill, Section } from '@/components/common/display'
import { ErrorState, QueryView } from '@/components/states/states'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Skeleton } from '@/components/ui/skeleton'
import { useSettings } from '@/features/assessment-cycles/api'
import { useCriteriaList, useGroups } from '@/features/players/api'
import { env } from '@/lib/env'
import { formatDateTime } from '@/lib/format'
import { useApiMutation, useApiQuery } from '@/lib/query'

const NO_DEFAULT = '__latest__'

const settingsForm = settingsInputSchema.extend({
  defaultMinEvaluatorCount: z.coerce
    .number<string | number>()
    .int()
    .min(1, '1以上')
    .max(20, '20以下'),
  progressWarningRate: z.coerce.number<string | number>().min(0).max(1),
})

function SettingsForm({ settings }: { settings: AppSettings }) {
  const criteria = useCriteriaList()
  const update = useApiMutation('settings.update', { successMessage: 'システム設定を保存しました' })
  const form = useForm<z.input<typeof settingsForm>, unknown, z.output<typeof settingsForm>>({
    resolver: zodResolver(settingsForm),
    defaultValues: settings,
  })
  const err = form.formState.errors
  return (
    <form onSubmit={(e) => void form.handleSubmit((v) => update.mutate(v))(e)} noValidate>
      <FieldGroup className="gap-4">
        <Field data-invalid={!!err.teamName}>
          <FieldLabel htmlFor="teamName">チーム名</FieldLabel>
          <Input id="teamName" {...form.register('teamName')} />
          <FieldError errors={[err.teamName]} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!err.defaultMinEvaluatorCount}>
            <FieldLabel htmlFor="minEval">必要評価者数の初期値</FieldLabel>
            <Input
              id="minEval"
              type="number"
              inputMode="numeric"
              className="w-28"
              {...form.register('defaultMinEvaluatorCount')}
            />
            <FieldDescription>評価期間の作成時に初期値として使用します。</FieldDescription>
            <FieldError errors={[err.defaultMinEvaluatorCount]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="defaultCriteria">評価基準の初期値</FieldLabel>
            <Controller
              control={form.control}
              name="defaultCriteriaVersionId"
              render={({ field }) => (
                <Select
                  value={field.value ?? NO_DEFAULT}
                  onValueChange={(v) => field.onChange(v === NO_DEFAULT ? null : v)}
                >
                  <SelectTrigger id="defaultCriteria" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEFAULT}>最新のバージョン</SelectItem>
                    {criteria.data?.map((c) => (
                      <SelectItem key={c.version.id} value={c.version.id}>
                        {c.version.version}（{c.version.name}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
      </FieldGroup>
      <div className="mt-5 flex justify-end">
        <Button type="submit" disabled={update.isPending || !form.formState.isDirty}>
          {update.isPending && <Loader2 className="animate-spin" />}保存
        </Button>
      </div>
    </form>
  )
}

const groupForm = groupInputSchema.extend({
  cohortYear: z.string().refine((v) => v === '' || /^\d{4}$/.test(v), '西暦4桁で入力してください'),
})

function GroupDialog({ target, onClose }: { target: Group | 'new'; onClose: () => void }) {
  const isNew = target === 'new'
  const create = useApiMutation('groups.create', {
    successMessage: 'グループを追加しました',
    onSuccess: onClose,
  })
  const update = useApiMutation('groups.update', {
    successMessage: 'グループを更新しました',
    onSuccess: onClose,
  })
  const form = useForm<z.infer<typeof groupForm>>({
    resolver: zodResolver(groupForm),
    defaultValues: isNew
      ? { name: '', cohortYear: '', status: 'active' }
      : {
          name: target.name,
          cohortYear: target.cohortYear?.toString() ?? '',
          status: target.status,
        },
  })
  const err = form.formState.errors
  const onSubmit = form.handleSubmit((v) => {
    const input = { ...v, cohortYear: v.cohortYear ? Number(v.cohortYear) : null }
    if (isNew) create.mutate(input)
    else update.mutate({ ...input, id: target.id })
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? '所属学年グループを追加' : 'グループを編集'}</DialogTitle>
          <DialogDescription>進級しても選手IDと評価履歴は変わりません。</DialogDescription>
        </DialogHeader>
        <form id="group-form" onSubmit={(e) => void onSubmit(e)} noValidate>
          <FieldGroup className="gap-4">
            <Field data-invalid={!!err.name}>
              <FieldLabel htmlFor="gname">グループ名</FieldLabel>
              <Input id="gname" placeholder="例：3年生" {...form.register('name')} />
              <FieldError errors={[err.name]} />
            </Field>
            <Field data-invalid={!!err.cohortYear}>
              <FieldLabel htmlFor="cohort">世代（入学年度等）</FieldLabel>
              <Input
                id="cohort"
                inputMode="numeric"
                placeholder="例：2018"
                className="w-32"
                {...form.register('cohortYear')}
              />
              <FieldError errors={[err.cohortYear]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="gstatus">状態</FieldLabel>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="gstatus" className="w-40">
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
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" form="group-form" disabled={create.isPending || update.isPending}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Groups() {
  const query = useGroups()
  const [target, setTarget] = useState<Group | 'new' | null>(null)
  return (
    <Section
      title="所属学年グループ"
      contentClassName="p-0"
      actions={
        <Button size="sm" variant="outline" onClick={() => setTarget('new')}>
          <Plus /> 追加
        </Button>
      }
    >
      <QueryView query={query} loading={<Skeleton className="m-5 h-20" />}>
        {(groups) => (
          <ul className="divide-y">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="flex-1 font-medium">{g.name}</span>
                <span className="num text-sm text-muted-foreground">{g.cohortYear ?? '—'}</span>
                <Pill tone={g.status === 'active' ? 'success' : 'neutral'}>
                  {g.status === 'active' ? '有効' : '無効'}
                </Pill>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${g.name}を編集`}
                  onClick={() => setTarget(g)}
                >
                  <Pencil />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      {target && <GroupDialog target={target} onClose={() => setTarget(null)} />}
    </Section>
  )
}

function SystemInfo() {
  const health = useApiQuery('health.check', {}, { staleTime: 0, retry: false })
  return (
    <Section title="アプリケーション情報" contentClassName="space-y-3 text-sm">
      <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
        <dt className="text-muted-foreground">バージョン</dt>
        <dd className="num">{env.appVersion}</dd>
        <dt className="text-muted-foreground">環境</dt>
        <dd>
          {env.appEnv}
          {env.useMock && '（モック）'}
        </dd>
        <dt className="text-muted-foreground">バックエンド</dt>
        <dd>
          {health.isPending ? (
            <span className="text-muted-foreground">確認中…</span>
          ) : health.isError ? (
            <Pill tone="danger">接続エラー</Pill>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <Pill tone="success">接続OK</Pill>
              <span className="text-xs text-muted-foreground">
                {health.data.env}・スキーマ v{health.data.schemaVersion}・
                {formatDateTime(health.data.serverTime)}
              </span>
            </span>
          )}
        </dd>
      </dl>
      <Button variant="outline" size="sm" asChild>
        <Link to="/dev/connectivity">
          <Activity /> 接続診断を開く
        </Link>
      </Button>
    </Section>
  )
}

function AuditLogs() {
  const query = useApiQuery('audit.list', { limit: 50 })
  return (
    <Section title="操作履歴" description="直近50件" contentClassName="p-0">
      <QueryView query={query} loading={<Skeleton className="m-5 h-24" />}>
        {(logs) =>
          logs.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">操作履歴はありません。</p>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto text-sm">
              {logs.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 sm:px-5"
                >
                  <span className="num text-xs text-muted-foreground">
                    {formatDateTime(l.createdAt)}
                  </span>
                  <span className="font-medium">{l.actorName}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{l.action}</code>
                  <span className="text-xs text-muted-foreground">{l.targetType}</span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </Section>
  )
}

export function SettingsPage() {
  const settings = useSettings()
  return (
    <>
      <PageHeader title="システム設定" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="基本設定">
          {settings.isPending ? (
            <Skeleton className="h-48" />
          ) : settings.isError ? (
            <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
          ) : (
            <SettingsForm settings={settings.data} />
          )}
        </Section>
        <SystemInfo />
        <Groups />
        <AuditLogs />
      </div>
    </>
  )
}
