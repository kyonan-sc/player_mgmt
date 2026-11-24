import type { ApiAction, ApiPayloadInput, ApiResult } from '@kyonan/shared'
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiClientError, callApi, newRequestId } from '@/lib/api-client'

const NO_RETRY_CODES = new Set([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
])

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (count, error) =>
          !(error instanceof ApiClientError && NO_RETRY_CODES.has(error.code)) && count < 2,
      },
      mutations: { retry: false },
    },
  })
}

export const apiQueryKey = <A extends ApiAction>(action: A, payload?: ApiPayloadInput<A>) =>
  payload === undefined ? ([action] as const) : ([action, payload] as const)

/** API 由来のデータは TanStack Query で管理する（技術仕様 6.3） */
export function useApiQuery<A extends ApiAction>(
  action: A,
  payload: ApiPayloadInput<A>,
  options: Omit<UseQueryOptions<ApiResult<A>, ApiClientError>, 'queryKey' | 'queryFn'> = {},
) {
  return useQuery<ApiResult<A>, ApiClientError>({
    queryKey: apiQueryKey(action, payload),
    queryFn: ({ signal }) => callApi(action, payload, { signal }),
    ...options,
  })
}

interface MutationOptions<A extends ApiAction> {
  successMessage?: string | ((data: ApiResult<A>) => string)
  /** エラー時に Toast を表示しない（画面側で個別に扱う場合） */
  silentError?: boolean
  onSuccess?: (data: ApiResult<A>) => void
}

/**
 * 変更系 API。requestId を呼び出しごとに発行し、成功後は関連するキャッシュを無効化する。
 * 小規模データのため、整合性を優先して全クエリを再取得する。
 *
 * 保存に 0.4 秒以上かかるときは「保存しています…」のトーストを出し、結果が出たら成功・失敗の通知に置き換える。
 * ダイアログが閉じる操作（在籍終了・確定など）でも、処理中であることが分かるようにするため。
 */
const SAVING_TOAST_DELAY_MS = 400

export function useApiMutation<A extends ApiAction>(action: A, options: MutationOptions<A> = {}) {
  const queryClient = useQueryClient()
  return useMutation<
    ApiResult<A>,
    ApiClientError,
    ApiPayloadInput<A>,
    { toastId: string; timer: number }
  >({
    mutationFn: (payload) => callApi(action, payload, { requestId: newRequestId() }),
    onMutate: () => {
      const toastId = `saving-${newRequestId()}`
      const timer = window.setTimeout(
        () => toast.loading('保存しています…', { id: toastId, duration: Infinity }),
        SAVING_TOAST_DELAY_MS,
      )
      return { toastId, timer }
    },
    onSuccess: async (data, _vars, ctx) => {
      window.clearTimeout(ctx?.timer)
      const message =
        typeof options.successMessage === 'function'
          ? options.successMessage(data)
          : options.successMessage
      // 保存の完了を先に知らせ、そのあとで最新データの再取得を待つ
      if (message) toast.success(message, { id: ctx?.toastId })
      else if (ctx) toast.dismiss(ctx.toastId)
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth.me' })
      options.onSuccess?.(data)
    },
    onError: (error, _vars, ctx) => {
      window.clearTimeout(ctx?.timer)
      if (!options.silentError) toast.error(error.message, { id: ctx?.toastId })
      else if (ctx) toast.dismiss(ctx.toastId)
    },
  })
}
