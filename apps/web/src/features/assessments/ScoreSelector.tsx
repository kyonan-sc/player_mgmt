import { SCORE_LEVEL_DEFINITIONS, SCORE_LEVELS, type CriteriaItem } from '@kyonan/shared'
import { BookOpen, RotateCcw } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

/** 1〜5点の評価基準。2点・4点は隣接段階の中間として扱う（要件 3.4） */
export function RubricSheet({ item, selected }: { item: CriteriaItem; selected: number | null }) {
  const isMobile = useIsMobile()
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
          aria-label={`${item.name}の評価基準を表示`}
        >
          <BookOpen className="size-3.5" /> 基準
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(isMobile && 'max-h-[85dvh] rounded-t-2xl')}
      >
        <SheetHeader>
          <SheetTitle>{item.name}</SheetTitle>
          <SheetDescription>{item.description}</SheetDescription>
        </SheetHeader>
        <ol className="space-y-2 overflow-y-auto px-4 pb-6">
          {[...SCORE_LEVELS].reverse().map((level) => {
            const specific = item.rubric[String(level) as '1' | '3' | '5']
            return (
              <li
                key={level}
                className={cn(
                  'flex gap-3 rounded-lg border p-3',
                  selected === level && 'border-primary/40 bg-primary/5',
                )}
              >
                <span className="num flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold">
                  {level}
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {specific ??
                      (level === 4 ? '3点と5点の中間' : level === 2 ? '1点と3点の中間' : '—')}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {SCORE_LEVEL_DEFINITIONS[level]}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </SheetContent>
    </Sheet>
  )
}

/**
 * 1〜5点の選択。グラウンドでの片手操作を想定し、横並びの大きなタップ領域（48px）とする。
 * 初期状態は未選択で、3点等の初期値は設定しない（要件 7.8）。
 */
export function ScoreSelector({
  item,
  value,
  onChange,
  disabled,
}: {
  item: CriteriaItem
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = Math.min(SCORE_LEVELS.length - 1, Math.max(0, index + delta))
    refs.current[next]?.focus()
    onChange(SCORE_LEVELS[next]!)
  }

  return (
    <div className="flex items-center gap-2">
      <div
        role="radiogroup"
        aria-label={`${item.name}の評価`}
        className="grid flex-1 grid-cols-5 gap-1.5"
      >
        {SCORE_LEVELS.map((level, i) => {
          const checked = value === level
          return (
            <button
              key={level}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${level}点：${SCORE_LEVEL_DEFINITIONS[level]}`}
              tabIndex={checked || (value === null && i === 0) ? 0 : -1}
              disabled={disabled}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={() => onChange(level)}
              className={cn(
                'num h-12 rounded-lg border text-lg font-semibold transition-colors duration-150 select-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50',
                checked
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-input bg-card text-foreground active:bg-accent sm:hover:border-brand-accent/50 sm:hover:bg-accent',
              )}
            >
              {level}
            </button>
          )
        })}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-12 shrink-0 text-muted-foreground"
        disabled={disabled || value === null}
        onClick={() => onChange(null)}
        aria-label={`${item.name}を未評価に戻す`}
      >
        <RotateCcw className="size-4" />
      </Button>
    </div>
  )
}
