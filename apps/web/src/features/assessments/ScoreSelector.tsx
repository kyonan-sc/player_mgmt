import { itemMax, SCORE_LEVEL_DEFINITIONS, type CriteriaItem } from '@kyonan/shared'
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

/** 未観察の判断の目安 */
const UNOBSERVED_HINT = 'この期間中、観察できる機会がほとんどなかった場合'

const levelsOf = (item: CriteriaItem): number[] =>
  Array.from({ length: itemMax(item) }, (_, i) => i + 1)

/** 「見出し：説明」形式の基準文を分ける。見出しがなければ説明のみ。 */
function splitRubric(text: string | undefined): { label?: string; detail?: string } {
  if (!text) return {}
  const i = text.indexOf('：')
  return i < 0 ? { detail: text } : { label: text.slice(0, i), detail: text.slice(i + 1) }
}

/** 段階の説明。5段階の項目は 2・4 点を中間として扱う（要件 3.4） */
function levelText(item: CriteriaItem, level: number): { label?: string; detail: string } {
  const specific = splitRubric(item.rubric[String(level) as '1' | '3' | '5'])
  if (specific.detail) return { label: specific.label, detail: specific.detail }
  if (itemMax(item) === 5 && level === 4) return { detail: '3点と5点の中間' }
  if (itemMax(item) === 5 && level === 2) return { detail: '1点と3点の中間' }
  return { detail: '—' }
}

const generalDefinition = (item: CriteriaItem, level: number) =>
  itemMax(item) === 5
    ? SCORE_LEVEL_DEFINITIONS[level as 1 | 2 | 3 | 4 | 5]
    : (splitRubric(item.rubric[String(level) as '1' | '2' | '3']).label ?? '')

/** 1〜満点の評価基準。未観察を許可している項目は、未観察の目安も表示する */
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
          {[...levelsOf(item)].reverse().map((level) => {
            const text = levelText(item, level)
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
                  {text.label && <p className="font-medium">{text.label}</p>}
                  <p
                    className={text.label ? 'mt-0.5 text-xs text-muted-foreground' : 'font-medium'}
                  >
                    {text.detail}
                  </p>
                  {!text.label && itemMax(item) === 5 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {generalDefinition(item, level)}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
          {item.allowUnobserved && (
            <li
              className={cn(
                'flex gap-3 rounded-lg border border-dashed p-3',
                selected === null && 'border-primary/40 bg-primary/5',
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold">
                未観察
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-medium">点数をつけない</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{UNOBSERVED_HINT}</p>
              </div>
            </li>
          )}
        </ol>
      </SheetContent>
    </Sheet>
  )
}

/**
 * 点数の選択。グラウンドでの片手操作を想定し、横並びの大きなタップ領域（48px 以上）とする。
 * 初期状態は未選択で、3点等の初期値は設定しない（要件 7.8）。
 * 未観察を許可した項目は「未観察」を選択肢として並べる（未選択＝未観察。点数は平均に含めない）。
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
  const levels = levelsOf(item)
  const options: (number | null)[] = item.allowUnobserved ? [...levels, null] : levels
  const showLabels = itemMax(item) < 5
  const focusIndex = Math.max(0, options.indexOf(value))

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = Math.min(options.length - 1, Math.max(0, index + delta))
    refs.current[next]?.focus()
    onChange(options[next]!)
  }

  return (
    <div className="flex items-center gap-2">
      <div
        role="radiogroup"
        aria-label={`${item.name}の評価`}
        className="grid flex-1 gap-1.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option, i) => {
          const checked = value === option
          const unobserved = option === null
          const label = unobserved ? '' : (levelText(item, option).label ?? '')
          return (
            <button
              key={option ?? 'unobserved'}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={
                unobserved
                  ? `未観察（${UNOBSERVED_HINT}）`
                  : `${option}点：${generalDefinition(item, option)}`
              }
              tabIndex={i === focusIndex ? 0 : -1}
              disabled={disabled}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={() => onChange(option)}
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border leading-tight transition-colors duration-150 select-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50',
                showLabels || unobserved ? 'min-h-14 px-1 py-1.5' : 'h-12',
                checked
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-input bg-card text-foreground active:bg-accent sm:hover:border-brand-accent/50 sm:hover:bg-accent',
              )}
            >
              {unobserved ? (
                <span className="text-sm font-semibold">未観察</span>
              ) : (
                <>
                  <span className="num text-lg font-semibold">{option}</span>
                  {showLabels && label && (
                    <span
                      className={cn(
                        'mt-0.5 text-[11px] font-medium',
                        checked ? 'text-primary-foreground/90' : 'text-muted-foreground',
                      )}
                    >
                      {label}
                    </span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>
      {/* 未観察を選べる項目は「未観察」ボタンが取り消しの役割を持つ */}
      {!item.allowUnobserved && (
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
      )}
    </div>
  )
}
