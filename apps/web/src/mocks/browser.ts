import { setupWorker } from 'msw/browser'
import { createMockHandlers } from './handlers'

export async function startMockWorker(): Promise<void> {
  const worker = setupWorker(...createMockHandlers({ latencyMs: 350 }))
  await worker.start({
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    onUnhandledRequest: 'bypass',
    quiet: true,
  })
}
