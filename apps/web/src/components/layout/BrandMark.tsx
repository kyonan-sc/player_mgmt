import { cn } from '@/lib/utils'

/** チームロゴ未支給のためのテキストロゴ（Q-04） */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex items-center justify-center rounded-lg bg-primary text-[10px] font-bold tracking-wide text-primary-foreground',
        className,
      )}
    >
      KSC
    </span>
  )
}
