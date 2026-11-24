import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { env } from '@/lib/env'
import '@/styles/index.css'

async function bootstrap() {
  // 静的に置換される条件にして、本番ビルドからモック実装を除去する
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    if (env.appEnv === 'production') throw new Error('本番環境ではモックモードを有効にできません')
    const { startMockWorker } = await import('@/mocks/browser')
    await startMockWorker()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
