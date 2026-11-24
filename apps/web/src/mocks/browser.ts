import { setupWorker } from 'msw/browser'
import { createMockHandlers } from './handlers'

/** 応答の遅さを再現して待機表示を確認できるよう、VITE_MOCK_LATENCY_MS（ミリ秒）で変更できる */
const DEFAULT_LATENCY_MS = 350

export async function startMockWorker(): Promise<void> {
  const configured = Number(import.meta.env.VITE_MOCK_LATENCY_MS)
  const latencyMs = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_LATENCY_MS
  const worker = setupWorker(...createMockHandlers({ latencyMs }))
  await worker.start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    onUnhandledRequest: 'bypass',
    quiet: true,
  })
}
