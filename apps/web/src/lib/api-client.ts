import type { ApiAction, ApiError, ApiPayloadInput, ApiResponse, ApiResult } from '@kyonan/shared'
import { env } from '@/lib/env'
import { useAuthStore } from '@/stores/auth-store'

export type ClientErrorCode = ApiError['code'] | 'NETWORK_ERROR'

export class ApiClientError extends Error {
  constructor(
    public readonly code: ClientErrorCode,
    message: string,
    public readonly details: ApiError['details'] = [],
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export function newRequestId(): string {
  return crypto.randomUUID()
}

const PUBLIC_ACTIONS: ApiAction[] = ['health.check']

/**
 * GAS Web App への RPC 呼び出し（技術仕様 8.1）。
 * プリフライトを避けるため text/plain で送信し、独自ヘッダーは使用しない。ID Token はボディに含める。
 */
export async function callApi<A extends ApiAction>(
  action: A,
  payload: ApiPayloadInput<A>,
  options: { requestId?: string; signal?: AbortSignal; idToken?: string | null } = {},
): Promise<ApiResult<A>> {
  const requestId = options.requestId ?? newRequestId()
  const idToken = PUBLIC_ACTIONS.includes(action)
    ? null
    : (options.idToken ?? useAuthStore.getState().idToken)
  if (!env.apiUrl)
    throw new ApiClientError('NETWORK_ERROR', 'API の接続先が設定されていません（VITE_API_URL）')

  let response: Response
  try {
    response = await fetch(env.apiUrl, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ action, requestId, idToken, payload }),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiClientError(
      'NETWORK_ERROR',
      'サーバーに接続できませんでした。通信環境を確認してください。',
      [],
      requestId,
    )
  }

  let body: ApiResponse<ApiResult<A>>
  try {
    body = (await response.json()) as ApiResponse<ApiResult<A>>
  } catch {
    throw new ApiClientError(
      'NETWORK_ERROR',
      `サーバーから不正な応答を受信しました（HTTP ${response.status}）`,
      [],
      requestId,
    )
  }

  if (!body.success) {
    if (body.error.code === 'UNAUTHENTICATED' && idToken) useAuthStore.getState().clear('expired')
    throw new ApiClientError(
      body.error.code,
      body.error.message,
      body.error.details ?? [],
      requestId,
    )
  }
  return body.data
}

export function isApiError(error: unknown, ...codes: ClientErrorCode[]): boolean {
  return error instanceof ApiClientError && (codes.length === 0 || codes.includes(error.code))
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message
  return '予期しないエラーが発生しました'
}
