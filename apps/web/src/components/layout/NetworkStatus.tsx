import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNetworkActivity } from '@/lib/network-activity'

/** この秒数を超えて待っているときに、段階的にメッセージを出す */
export const PROGRESS_DELAY_S = 0.25
export const SLOW_AFTER_S = 3
export const VERY_SLOW_AFTER_S = 8

/** 最も古い実行中リクエストの経過秒数（実行中でなければ 0）。250ms ごとに更新する。 */
function useWaitSeconds(): number {
  const oldest = useNetworkActivity((s) => s.oldest)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (oldest === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [oldest])
  return oldest === null ? 0 : Math.max(0, (now - oldest) / 1000)
}

/**
 * バックエンド（GAS）の応答待ちを画面全体で知らせる。
 * 0.25 秒以上：画面上端の進行バー / 3 秒以上：経過秒数つきのメッセージ / 8 秒以上：起動待ちの案内。
 * ごく短い通信では何も表示せず、ちらつきを避ける。
 */
export function NetworkStatus() {
  const busy = useNetworkActivity((s) => s.oldest !== null)
  const seconds = useWaitSeconds()
  const showBar = busy && seconds >= PROGRESS_DELAY_S
  const stage =
    !busy || seconds < SLOW_AFTER_S ? 'none' : seconds < VERY_SLOW_AFTER_S ? 'slow' : 'very-slow'

  return (
    <>
      <div
        aria-hidden
        data-testid="network-progress"
        className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden bg-primary/15 transition-opacity duration-200 ${showBar ? 'opacity-100' : 'opacity-0'}`}
      >
        {showBar && <div className="animate-indeterminate h-full w-2/5 rounded-full bg-primary" />}
      </div>
      {stage !== 'none' && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed top-[4.25rem] left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur"
        >
          <div className="flex items-center gap-3">
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
            <p className="flex-1 text-sm font-medium">
              {stage === 'slow'
                ? 'サーバーの応答を待っています…'
                : 'サーバーの応答に時間がかかっています'}
            </p>
            <span className="num text-xs text-muted-foreground">{Math.floor(seconds)}秒</span>
          </div>
          {stage === 'very-slow' && (
            <p className="mt-1.5 pl-7 text-xs leading-relaxed text-muted-foreground">
              しばらく使っていないあとの最初の操作は、数十秒かかることがあります。そのままお待ちください。
            </p>
          )}
        </div>
      )}
    </>
  )
}
