import { createMockApi } from '@kyonan/gas/core'
import { delay, http, HttpResponse } from 'msw'
import { env } from '@/lib/env'
import { buildMockDataset } from './seed'

export function createMockHandlers(options: { latencyMs?: number; now?: () => Date } = {}) {
  // バックエンドの services/api 層を同一コードのままインメモリで動かす（S-11）
  const api = createMockApi(buildMockDataset(), { now: options.now })
  return [
    http.post(env.apiUrl, async ({ request }) => {
      const body = await request.text()
      if (options.latencyMs) await delay(options.latencyMs)
      return HttpResponse.json(api.handle(body))
    }),
  ]
}
