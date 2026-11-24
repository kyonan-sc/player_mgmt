export interface CacheLike {
  get(key: string): string | null
  put(key: string, value: string, ttlSeconds: number): void
  remove(key: string): void
}

export interface HttpResponse {
  status: number
  body: string
  headers: Record<string, string>
}

export interface AppConfig {
  appEnv: string
  googleClientId: string
  schemaVersion: string
  bootstrapAdminEmail: string | null
  /** 検証環境専用のゲスト閲覧用パスワード。未設定ならゲスト入場は無効 */
  guestViewerPassword: string | null
}

/** 実行環境（GAS / テスト / ブラウザ内モック）に依存する機能の抽象 */
export interface Runtime {
  now(): Date
  uuid(): string
  /** 書き込み処理を直列化する。取得できない場合は例外を投げる。 */
  withLock<T>(fn: () => T): T
  cache: CacheLike
  fetchText(url: string): HttpResponse
  /** HMAC-SHA256 を16進文字列で返す */
  hmacSha256Hex(key: string, message: string): string
  config: AppConfig
  logError(message: string, error?: unknown): void
}

export class MemoryCache implements CacheLike {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>()
  constructor(private readonly clock: () => number = () => Date.now()) {}

  get(key: string): string | null {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(key)
      return null
    }
    return entry.value
  }

  put(key: string, value: string, ttlSeconds: number): void {
    this.entries.set(key, { value, expiresAt: this.clock() + ttlSeconds * 1000 })
  }

  remove(key: string): void {
    this.entries.delete(key)
  }
}
