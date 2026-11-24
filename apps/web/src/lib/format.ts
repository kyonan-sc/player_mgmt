import type { CriteriaDefinition } from '@kyonan/shared'

const TZ = 'Asia/Tokyo'

const dateFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})
const shortDateFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TZ,
  month: 'numeric',
  day: 'numeric',
})
const dateTimeFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** YYYY-MM-DD（暦日）を Asia/Tokyo の日付として解釈する */
function toDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+09:00`) : new Date(value)
}

export const formatDate = (v: string | null | undefined) => (v ? dateFmt.format(toDate(v)) : '—')
export const formatShortDate = (v: string | null | undefined) =>
  v ? shortDateFmt.format(toDate(v)) : '—'
export const formatDateTime = (v: string | null | undefined) =>
  v ? dateTimeFmt.format(toDate(v)) : '—'

/** 今日の日付（Asia/Tokyo）を YYYY-MM-DD で返す */
export function todayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return parts
}

export const formatScore = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(digits)

export function formatDiff(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  if (v === 0) return '±0.0'
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`
}

export const formatPercent = (v: number) => `${Math.round(v * 100)}%`

/** カテゴリ得点を配点に対する割合（0〜100）に正規化する（レーダーチャート用） */
export function normalizeCategory(score: number | undefined, weight: number): number | null {
  if (score === undefined || weight <= 0) return null
  return Math.round((score / weight) * 1000) / 10
}

export function categoryName(criteria: CriteriaDefinition | undefined, key: string): string {
  return criteria?.categories.find((c) => c.categoryKey === key)?.name ?? key
}

export function itemLookup(criteria: CriteriaDefinition | undefined) {
  const map = new Map<string, { name: string; categoryKey: string }>()
  criteria?.categories.forEach((c) =>
    c.items.forEach((i) => map.set(i.itemKey, { name: i.name, categoryKey: c.categoryKey })),
  )
  return map
}
