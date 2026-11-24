import { AppError } from '../api/errors'
import { SCHEMA_VERSION } from '../repositories/schema'
import type { AppConfig, CacheLike, HttpResponse, Runtime } from './runtime'

const LOCK_TIMEOUT_MS = 20_000

export function readConfig(): AppConfig {
  const props = PropertiesService.getScriptProperties()
  return {
    appEnv: props.getProperty('APP_ENV') ?? 'production',
    googleClientId: props.getProperty('GOOGLE_CLIENT_ID') ?? '',
    schemaVersion: props.getProperty('SCHEMA_VERSION') ?? SCHEMA_VERSION,
    bootstrapAdminEmail: props.getProperty('BOOTSTRAP_ADMIN_EMAIL'),
    guestViewerPassword: props.getProperty('GUEST_VIEWER_PASSWORD'),
  }
}

export function openSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  if (!id) throw new Error('Script Property SPREADSHEET_ID is not set')
  return SpreadsheetApp.openById(id)
}

class GasCache implements CacheLike {
  private readonly cache = CacheService.getScriptCache()
  get(key: string) {
    return this.cache.get(key)
  }
  put(key: string, value: string, ttlSeconds: number) {
    this.cache.put(key, value, ttlSeconds)
  }
  remove(key: string) {
    this.cache.remove(key)
  }
}

export function createGasRuntime(): Runtime {
  return {
    now: () => new Date(),
    uuid: () => Utilities.getUuid(),
    withLock<T>(fn: () => T): T {
      const lock = LockService.getScriptLock()
      if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
        throw new AppError(
          'CONFLICT',
          '他の更新処理が実行中です。しばらく待ってから再度お試しください。',
        )
      }
      try {
        const result = fn()
        SpreadsheetApp.flush()
        return result
      } finally {
        lock.releaseLock()
      }
    },
    cache: new GasCache(),
    hmacSha256Hex(key: string, message: string): string {
      const bytes = Utilities.computeHmacSha256Signature(message, key)
      return bytes.map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('')
    },
    fetchText(url: string): HttpResponse {
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true })
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(res.getHeaders() as Record<string, unknown>))
        headers[k] = String(v)
      return { status: res.getResponseCode(), body: res.getContentText(), headers }
    },
    config: readConfig(),
    logError(message: string, error?: unknown) {
      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
          : String(error)
      console.error(`${message}\n${detail}`)
    },
  }
}
