import type { ApiPayloadInput } from '@kyonan/shared'
import { useApiMutation, useApiQuery } from '@/lib/query'

export const useCycles = (p: ApiPayloadInput<'cycles.list'> = {}) => useApiQuery('cycles.list', p)
export const useCycleOverview = (cycleId: string) => useApiQuery('assessments.list', { cycleId })
export const useResults = (cycleId: string) => useApiQuery('results.list', { cycleId })
export const useSettings = () => useApiQuery('settings.get', {}, { staleTime: 5 * 60_000 })

export const useCreateCycle = () =>
  useApiMutation('cycles.create', { successMessage: '評価期間を作成しました' })
export const useUpdateCycle = () =>
  useApiMutation('cycles.update', { successMessage: '評価期間を更新しました' })
export const useOpenCycle = () =>
  useApiMutation('cycles.open', { successMessage: '評価を開始しました' })
export const useFinalizeCycle = () =>
  useApiMutation('cycles.finalize', { successMessage: '評価を確定しました' })
