import {
  apiPayloadSchemas,
  apiRequestSchema,
  type ApiAction,
  type ApiResponse,
  type HealthStatus,
} from '@kyonan/shared'
import type { z } from 'zod'
import type { Ctx } from '../auth/authorization'
import type { IdTokenVerifier } from '../auth/verifier'
import type { Runtime } from '../infrastructure/runtime'
import type { TableStore } from '../infrastructure/table-store'
import { createDb } from '../repositories/db'
import { resolveActor } from '../services/auth-service'
import { AppError } from './errors'
import { handlers } from './handlers'

const RATE_LIMIT_PER_MINUTE = 120
const IDEMPOTENCY_TTL_SECONDS = 600
/** CacheService の値サイズ上限（100KB）に余裕を持たせる */
const IDEMPOTENCY_MAX_BYTES = 90_000

export interface ApiDeps {
  store: TableStore
  runtime: Runtime
  verifier: IdTokenVerifier
}

const isAction = (action: string): action is ApiAction =>
  Object.prototype.hasOwnProperty.call(apiPayloadSchemas, action)

function zodDetails(error: z.ZodError) {
  return error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message }))
}

/**
 * RPC リクエストを処理する。GAS は HTTP ステータスを設定できないため、
 * 結果は常にボディの success / error.code で返す。
 */
export function handleRequest(rawBody: string, deps: ApiDeps): ApiResponse<unknown> {
  let requestId = 'unknown'
  try {
    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      throw new AppError('VALIDATION_ERROR', 'リクエストの形式が正しくありません')
    }
    const envelope = apiRequestSchema.safeParse(parsedBody)
    if (!envelope.success)
      throw new AppError('VALIDATION_ERROR', 'リクエストの形式が正しくありません')
    requestId = envelope.data.requestId
    const { action, idToken } = envelope.data
    if (!isAction(action)) throw new AppError('VALIDATION_ERROR', `不明な操作です: ${action}`)

    const payload = apiPayloadSchemas[action].safeParse(envelope.data.payload ?? {})
    if (!payload.success) {
      throw new AppError('VALIDATION_ERROR', '入力内容に誤りがあります', zodDetails(payload.error))
    }

    if (action === 'health.check') {
      const data: HealthStatus = {
        status: 'ok',
        env: deps.runtime.config.appEnv,
        schemaVersion: deps.runtime.config.schemaVersion,
        serverTime: deps.runtime.now().toISOString(),
      }
      return { success: true, data, requestId }
    }

    if (!idToken) throw new AppError('UNAUTHENTICATED', 'ログインが必要です')
    const claims = deps.verifier.verify(idToken)
    enforceRateLimit(deps.runtime, claims.sub)

    const def = handlers[action]
    const idemKey = `idem:${claims.sub}:${requestId}`
    if (def.mutating) {
      const cached = deps.runtime.cache.get(idemKey)
      if (cached) return JSON.parse(cached) as ApiResponse<unknown>
    }

    const { actor, db } = resolveActor(() => createDb(deps.store), claims, deps.runtime, requestId)
    const run = (ctxDb: typeof db) => {
      const ctx: Ctx = { db: ctxDb, runtime: deps.runtime, actor, requestId, action }
      return (def.handler as (c: Ctx, p: unknown) => unknown)(ctx, payload.data)
    }

    if (!def.mutating) return { success: true, data: run(db), requestId }

    // ロック取得後に読み直し、一意性・更新バージョンを再確認する
    const data = deps.runtime.withLock(() => run(createDb(deps.store)))
    const response: ApiResponse<unknown> = { success: true, data, requestId }
    const serialized = JSON.stringify(response)
    if (serialized.length < IDEMPOTENCY_MAX_BYTES)
      deps.runtime.cache.put(idemKey, serialized, IDEMPOTENCY_TTL_SECONDS)
    return response
  } catch (error) {
    if (error instanceof AppError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        requestId,
      }
    }
    // スタックトレースや内部情報はクライアントに返さない
    deps.runtime.logError(`Unhandled error (requestId=${requestId})`, error)
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'サーバーでエラーが発生しました。時間をおいて再度お試しください。',
      },
      requestId,
    }
  }
}

function enforceRateLimit(runtime: Runtime, sub: string): void {
  const minute = Math.floor(runtime.now().getTime() / 60000)
  const key = `rl:${sub}:${minute}`
  const count = Number(runtime.cache.get(key) ?? '0') + 1
  if (count > RATE_LIMIT_PER_MINUTE) {
    throw new AppError(
      'RATE_LIMITED',
      'リクエストが多すぎます。しばらく待ってから再度お試しください。',
    )
  }
  runtime.cache.put(key, String(count), 90)
}
