import { TEAMS, type Team, type TeamBoard, type TeamBoardPlayer } from '@kyonan/shared'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import {
  PageHeader,
  ScoreDelta,
  Section,
  TEAM_COLOR_VAR,
  TeamBadge,
} from '@/components/common/display'
import { EmptyState, QueryView } from '@/components/states/states'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useMe } from '@/features/auth/use-me'
import { formatDate, formatScore, todayIso } from '@/lib/format'
import { useApiMutation, useApiQuery } from '@/lib/query'

type Column = Team | 'none'
const COLUMNS: { key: Column; label: string }[] = [
  ...TEAMS.map((t) => ({ key: t as Column, label: `${t}チーム` })),
  { key: 'none', label: '未編成' },
]
const UNASSIGNED = 'none'

interface PendingChange {
  player: TeamBoardPlayer
  to: Team | null
}

function ChangeDialog({ change, onClose }: { change: PendingChange | null; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(todayIso())
  const [touched, setTouched] = useState(false)
  const assign = useApiMutation('teams.assign', {
    successMessage: 'チーム編成を変更しました',
    onSuccess: onClose,
  })
  if (!change) return null
  const differs = change.to !== change.player.recommendedTeam
  const reasonMissing = differs && reason.trim() === ''

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>所属チームを変更</DialogTitle>
          <DialogDescription>
            {change.player.player.displayName}さん：
            <TeamBadge team={change.player.currentTeam} emptyLabel="未編成" size="sm" /> →{' '}
            <TeamBadge team={change.to} emptyLabel="未編成" size="sm" />
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            最新評価の推奨：
            <TeamBadge team={change.player.recommendedTeam} size="sm" />
            （総合 {formatScore(change.player.totalScore)}点）
          </p>
          <Field data-invalid={touched && reasonMissing}>
            <FieldLabel htmlFor="reason">
              理由{differs && <span className="text-destructive"> *</span>}
            </FieldLabel>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例：ポジションバランスを考慮"
            />
            <FieldDescription>
              {differs ? '推奨チームと異なるため、理由の入力が必要です。' : '任意'}
            </FieldDescription>
            {touched && reasonMissing && <FieldError>理由を入力してください</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="effective">適用日</FieldLabel>
            <Input
              id="effective"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-44"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            disabled={assign.isPending || !effectiveDate}
            onClick={() => {
              setTouched(true)
              if (reasonMissing) return
              assign.mutate({
                playerId: change.player.player.id,
                assignedTeam: change.to,
                reason,
                effectiveDate,
              })
            }}
          >
            {assign.isPending && <Loader2 className="animate-spin" />}変更を保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlayerCard({
  p,
  editable,
  onChange,
}: {
  p: TeamBoardPlayer
  editable: boolean
  onChange: (to: Team | null) => void
}) {
  const mismatch = p.recommendedTeam !== null && p.currentTeam !== p.recommendedTeam
  return (
    <li className="rounded-lg border bg-card p-3 shadow-card">
      <div className="flex items-start gap-2">
        <span className="num mt-0.5 w-6 text-right text-xs text-muted-foreground">
          {p.player.jerseyNumber ?? '—'}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            to={`/players/${p.player.id}`}
            className="block truncate font-medium hover:underline"
          >
            {p.player.displayName}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="num font-semibold">{formatScore(p.totalScore)}点</span>
            <ScoreDelta value={p.diff} className="text-xs" />
            <TeamBadge team={p.recommendedTeam} size="sm" prefix="推奨" />
          </div>
        </div>
      </div>
      {mismatch && <p className="mt-2 text-[11px] text-muted-foreground">推奨と異なる所属</p>}
      {editable && (
        <Select
          value={p.currentTeam ?? UNASSIGNED}
          onValueChange={(v) => onChange(v === UNASSIGNED ? null : (v as Team))}
        >
          <SelectTrigger
            className="mt-2 h-10 w-full sm:h-8"
            aria-label={`${p.player.displayName}の所属チーム`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLUMNS.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </li>
  )
}

function Board({ board }: { board: TeamBoard }) {
  const { isAdmin } = useMe()
  const [change, setChange] = useState<PendingChange | null>(null)
  const byColumn = (key: Column) =>
    board.players.filter((p) => (p.currentTeam ?? UNASSIGNED) === key)
  const names = new Map(board.players.map((p) => [p.player.id, p.player.displayName]))
  const onChange = (p: TeamBoardPlayer) => (to: Team | null) => {
    if (to !== p.currentTeam) setChange({ player: p, to })
  }

  const column = (c: (typeof COLUMNS)[number]) => {
    const list = byColumn(c.key)
    return (
      <div className="flex flex-col rounded-xl border bg-muted/40 p-2.5">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: TEAM_COLOR_VAR[c.key] }}
              aria-hidden
            />
            {c.label}
          </span>
          <span className="num text-xs text-muted-foreground">{list.length}名</span>
        </div>
        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            選手はいません
          </p>
        ) : (
          <ul className="space-y-2">
            {list.map((p) => (
              <PlayerCard key={p.player.id} p={p} editable={isAdmin} onChange={onChange(p)} />
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((c) => (
          <div key={c.key}>{column(c)}</div>
        ))}
      </div>
      <Tabs defaultValue="A" className="md:hidden">
        <TabsList className="grid h-11 w-full grid-cols-4">
          {COLUMNS.map((c) => (
            <TabsTrigger key={c.key} value={c.key} className="text-xs">
              {c.key === 'none' ? '未編成' : c.key}
              <span className="num ml-1 text-muted-foreground">{byColumn(c.key).length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {COLUMNS.map((c) => (
          <TabsContent key={c.key} value={c.key} className="mt-3">
            {column(c)}
          </TabsContent>
        ))}
      </Tabs>

      <Section title="編成変更の履歴" className="mt-6" contentClassName="p-0">
        {board.history.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">履歴はありません。</p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">適用日</TableHead>
                  <TableHead>選手</TableHead>
                  <TableHead>所属</TableHead>
                  <TableHead>推奨</TableHead>
                  <TableHead className="pr-5">理由</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.history.slice(0, 100).map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="num pl-5 text-muted-foreground">
                      {formatDate(h.effectiveDate)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {names.get(h.playerId) ?? '（退団）'}
                    </TableCell>
                    <TableCell>
                      <TeamBadge team={h.assignedTeam} emptyLabel="未編成" size="sm" />
                    </TableCell>
                    <TableCell>
                      <TeamBadge team={h.recommendedTeam} size="sm" />
                    </TableCell>
                    <TableCell
                      className="max-w-64 truncate pr-5 text-xs text-muted-foreground"
                      title={h.reason}
                    >
                      {h.reason || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
      {change && <ChangeDialog change={change} onClose={() => setChange(null)} />}
    </>
  )
}

export function TeamsPage() {
  const query = useApiQuery('teams.list', {})
  const { isAdmin } = useMe()
  return (
    <>
      <PageHeader
        title="チーム編成"
        description={
          isAdmin
            ? '推奨チームを参考に、コーチ間の協議結果を反映してください。公式戦の出場選手は自動決定しません。'
            : '現在の所属チームと最新評価の推奨'
        }
      />
      <QueryView query={query}>
        {(board) =>
          board.players.length === 0 ? (
            <EmptyState title="在籍している選手がいません" />
          ) : (
            <Board board={board} />
          )
        }
      </QueryView>
    </>
  )
}
