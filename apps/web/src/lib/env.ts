const APP_ENVS = ['mock', 'staging', 'production'] as const
export type AppEnv = (typeof APP_ENVS)[number]

function parseAppEnv(value: string | undefined): AppEnv {
  return (APP_ENVS as readonly string[]).includes(value ?? '') ? (value as AppEnv) : 'mock'
}

/** VITE_ で始まる環境変数はビルド成果物に含まれる公開情報として扱う */
export const env = {
  appEnv: parseAppEnv(import.meta.env.VITE_APP_ENV),
  apiUrl: String(import.meta.env.VITE_API_URL ?? ''),
  googleClientId: String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''),
  useMock: import.meta.env.VITE_USE_MOCK === 'true',
  appVersion: __APP_VERSION__,
}

export const MOCK_API_URL = 'https://mock-api.invalid/exec'
