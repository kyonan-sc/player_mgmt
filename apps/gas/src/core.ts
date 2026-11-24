/**
 * GAS バックエンドの環境非依存部分。ブラウザ内モック（MSW）と単体テストから利用する。
 * GAS 固有 API（SpreadsheetApp 等）を参照するモジュールはここから export しない。
 */
import { handleRequest, type ApiDeps } from './api/dispatcher'
import { MockIdTokenVerifier } from './auth/mock-id-token-verifier'
import { hmacSha256Hex } from './infrastructure/hmac'
import { MemoryCache, type AppConfig, type Runtime } from './infrastructure/runtime'
import { MemoryTableStore, type Row } from './infrastructure/table-store'

export { handleRequest, type ApiDeps }
export { MockIdTokenVerifier, MOCK_TOKEN_PREFIX } from './auth/mock-id-token-verifier'
export { MemoryCache, type Runtime, type AppConfig } from './infrastructure/runtime'
export { MemoryTableStore, type Row, type TableStore } from './infrastructure/table-store'
export { TABLES, SCHEMA_VERSION, encodeRow, decodeRow, type TableKey } from './repositories/schema'

export interface MemoryRuntimeOptions {
  now?: () => Date
  uuid?: () => string
  config?: Partial<AppConfig>
}

let fallbackCounter = 0
function defaultUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  fallbackCounter += 1
  return `id-${Date.now().toString(36)}-${fallbackCounter}`
}

export function createMemoryRuntime(options: MemoryRuntimeOptions = {}): Runtime {
  const now = options.now ?? (() => new Date())
  return {
    now,
    uuid: options.uuid ?? defaultUuid,
    withLock: (fn) => fn(),
    cache: new MemoryCache(() => now().getTime()),
    hmacSha256Hex,
    fetchText: () => {
      throw new Error('fetchText is not available in memory runtime')
    },
    config: {
      appEnv: 'mock',
      googleClientId: 'mock-client-id',
      schemaVersion: '1',
      bootstrapAdminEmail: null,
      guestPassword: null,
      ...options.config,
    },
    logError: (message, error) => console.error(message, error),
  }
}

/** インメモリのモック API を構築する（S-11） */
export function createMockApi(initial: Record<string, Row[]>, options: MemoryRuntimeOptions = {}) {
  const store = new MemoryTableStore(initial)
  const deps: ApiDeps = {
    store,
    runtime: createMemoryRuntime(options),
    verifier: new MockIdTokenVerifier(),
  }
  return {
    store,
    handle: (rawBody: string) => handleRequest(rawBody, deps),
  }
}
