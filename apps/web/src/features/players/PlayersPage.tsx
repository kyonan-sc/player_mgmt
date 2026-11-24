import type { PlayerListItem, Team } from '@kyonan/shared'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronRight, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { PageHeader, ScoreDelta, TeamBadge } from '@/components/common/display'
import { EmptyState, QueryView } from '@/components/states/states'
import { Button } from '@/components/ui/button'
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
import { useMe } from '@/features/auth/use-me'
import { formatDate, formatScore } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useGroups, usePlayers } from './api'

const CATEGORY_COLUMNS = [
  { key: 'TEC', label: '技術力' },
  { key: 'DEC', label: '判断力' },
  { key: 'DUE', label: '対人' },
  { key: 'INV', label: '関与' },
]

const scoreOrNull = (v: number | null | undefined) => (typeof v === 'number' ? v : null)
/** null を常に末尾に並べるソート */
const nullsLast = (a: number | null, b: number | null) =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b

const columns: ColumnDef<PlayerListItem>[] = [
  {
    id: 'jersey',
    header: '背番号',
    accessorFn: (r) => r.player.jerseyNumber,
    sortingFn: (a, b) => nullsLast(a.original.player.jerseyNumber, b.original.player.jerseyNumber),
    cell: ({ row }) => (
      <span className="num text-muted-foreground">{row.original.player.jerseyNumber ?? '—'}</span>
    ),
  },
  {
    id: 'name',
    header: '選手名',
    accessorFn: (r) => r.player.displayName,
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.player.displayName}
        {row.original.player.status === 'inactive' && (
          <span className="ml-2 text-xs text-muted-foreground">退団</span>
        )}
      </span>
    ),
  },
  { id: 'group', header: '学年', accessorFn: (r) => r.groupName },
  {
    id: 'team',
    header: '所属',
    accessorFn: (r) => r.currentTeam ?? 'Z',
    cell: ({ row }) => <TeamBadge team={row.original.currentTeam} emptyLabel="未編成" size="sm" />,
  },
  {
    id: 'total',
    header: '総合',
    accessorFn: (r) => scoreOrNull(r.latest?.totalScore),
    sortingFn: (a, b) =>
      nullsLast(
        scoreOrNull(a.original.latest?.totalScore),
        scoreOrNull(b.original.latest?.totalScore),
      ),
    cell: ({ row }) => (
      <span className="num font-semibold">{formatScore(row.original.latest?.totalScore)}</span>
    ),
  },
  {
    id: 'diff',
    header: '前回差',
    accessorFn: (r) => r.diff,
    sortingFn: (a, b) => nullsLast(a.original.diff, b.original.diff),
    cell: ({ row }) => <ScoreDelta value={row.original.diff} />,
  },
  ...CATEGORY_COLUMNS.map<ColumnDef<PlayerListItem>>((c) => ({
    id: c.key,
    header: c.label,
    accessorFn: (r) => scoreOrNull(r.latest?.categoryScores[c.key]),
    sortingFn: (a, b) =>
      nullsLast(
        scoreOrNull(a.original.latest?.categoryScores[c.key]),
        scoreOrNull(b.original.latest?.categoryScores[c.key]),
      ),
    cell: ({ row }) => (
      <span className="num">{formatScore(row.original.latest?.categoryScores[c.key])}</span>
    ),
  })),
  {
    id: 'lastDate',
    header: '最終評価日',
    accessorFn: (r) => r.latest?.cycleEndDate ?? '',
    cell: ({ row }) => (
      <span className="num text-muted-foreground">
        {formatDate(row.original.latest?.cycleEndDate)}
      </span>
    ),
  },
]

function PlayerTable({ rows }: { rows: PlayerListItem[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'jersey', desc: false }])
  const navigate = useNavigate()
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table は React Compiler の自動メモ化対象外
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <>
      {/* PC：全項目のテーブル */}
      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-card md:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted()
                  return (
                    <TableHead
                      key={h.id}
                      className="h-10 px-3 text-xs"
                      aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === 'asc' && <ArrowUp className="size-3" />}
                        {sorted === 'desc' && <ArrowDown className="size-3" />}
                      </button>
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => void navigate(`/players/${row.original.player.id}`)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="h-12 px-3">
                    {cell.column.id === 'name' ? (
                      <Link
                        to={`/players/${row.original.player.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </Link>
                    ) : (
                      flexRender(cell.column.columnDef.cell, cell.getContext())
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* スマートフォン：重要項目のみ */}
      <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-card md:hidden">
        {table.getRowModel().rows.map(({ original: r }) => (
          <li key={r.player.id}>
            <Link
              to={`/players/${r.player.id}`}
              className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-accent"
            >
              <span className="num w-6 text-right text-sm text-muted-foreground">
                {r.player.jerseyNumber ?? '—'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.player.displayName}</div>
                <div className="mt-1 flex items-center gap-2">
                  <TeamBadge team={r.currentTeam} emptyLabel="未編成" size="sm" />
                  {r.player.status === 'inactive' && (
                    <span className="text-xs text-muted-foreground">退団</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="num text-lg font-semibold">{formatScore(r.latest?.totalScore)}</div>
                <ScoreDelta value={r.diff} className="text-xs" />
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

export function PlayersPage() {
  const { isAdmin } = useMe()
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active')
  const [groupId, setGroupId] = useState<string>('all')
  const [team, setTeam] = useState<Team | 'none' | 'all'>('all')
  const [search, setSearch] = useState('')
  const groups = useGroups()
  const query = usePlayers({ status, groupId: groupId === 'all' ? undefined : groupId })

  const filter = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (rows: PlayerListItem[]) =>
      rows.filter(
        (r) =>
          (team === 'all' || (team === 'none' ? r.currentTeam === null : r.currentTeam === team)) &&
          (q === '' ||
            r.player.displayName.toLowerCase().includes(q) ||
            String(r.player.jerseyNumber ?? '') === q),
      )
  }, [search, team])

  return (
    <>
      <PageHeader
        title="選手"
        description="最新の確定評価と所属チーム"
        actions={
          isAdmin && (
            <Button asChild>
              <Link to="/players/new">
                <Plus /> 選手を登録
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="選手名・背番号で検索"
            className="pl-9"
            aria-label="選手名検索"
          />
        </div>
        <Select value={team} onValueChange={(v) => setTeam(v as typeof team)}>
          <SelectTrigger className="w-full sm:w-36" aria-label="チームで絞り込み">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全チーム</SelectItem>
            <SelectItem value="A">Aチーム</SelectItem>
            <SelectItem value="B">Bチーム</SelectItem>
            <SelectItem value="C">Cチーム</SelectItem>
            <SelectItem value="none">未編成</SelectItem>
          </SelectContent>
        </Select>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger className="w-full sm:w-36" aria-label="学年で絞り込み">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全学年</SelectItem>
            {groups.data?.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className={cn('w-full sm:w-32')} aria-label="在籍状態で絞り込み">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">在籍中</SelectItem>
            <SelectItem value="inactive">退団</SelectItem>
            <SelectItem value="all">すべて</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <QueryView query={query}>
        {(data) => {
          const rows = filter(data)
          if (data.length === 0) {
            return (
              <EmptyState
                title="選手が登録されていません"
                action={
                  isAdmin && (
                    <Button asChild>
                      <Link to="/players/new">
                        <Plus /> 選手を登録
                      </Link>
                    </Button>
                  )
                }
              />
            )
          }
          if (rows.length === 0)
            return (
              <EmptyState
                title="条件に一致する選手がいません"
                description="検索条件や絞り込みを変更してください。"
              />
            )
          return (
            <>
              <p className="mb-2 text-xs text-muted-foreground">{rows.length}名</p>
              <PlayerTable rows={rows} />
            </>
          )
        }}
      </QueryView>
    </>
  )
}
