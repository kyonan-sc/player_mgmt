/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string
  readonly VITE_API_URL?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_USE_MOCK?: string
  readonly VITE_MOCK_LATENCY_MS?: string
}
