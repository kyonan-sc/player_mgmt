import { useAuthStore } from '@/stores/auth-store'

export function useMe() {
  const me = useAuthStore((s) => s.me)
  return {
    me,
    isAdmin: me?.role === 'admin',
    canEvaluate: me?.role === 'admin' || me?.role === 'coach',
    canSeeComments: me?.role === 'admin' || me?.role === 'coach',
  }
}
