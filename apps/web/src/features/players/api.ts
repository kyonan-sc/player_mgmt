import type { ApiPayloadInput } from '@kyonan/shared'
import { useApiMutation, useApiQuery } from '@/lib/query'

export const usePlayers = (p: ApiPayloadInput<'players.list'>) => useApiQuery('players.list', p)
export const usePlayer = (id: string) => useApiQuery('players.get', { id })
export const useGroups = () => useApiQuery('groups.list', {}, { staleTime: 5 * 60_000 })
export const useCriteriaList = () => useApiQuery('criteria.list', {}, { staleTime: 5 * 60_000 })
export const useAssessmentHistory = (playerId: string, enabled: boolean) =>
  useApiQuery('assessments.getHistory', { playerId }, { enabled })

export const useCreatePlayer = () =>
  useApiMutation('players.create', { successMessage: '選手を登録しました' })
export const useUpdatePlayer = () =>
  useApiMutation('players.update', { successMessage: '選手情報を更新しました' })
export const useArchivePlayer = () =>
  useApiMutation('players.archive', { successMessage: '在籍状態を「退団」に変更しました' })
