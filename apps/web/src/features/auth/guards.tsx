import type { Role } from '@kyonan/shared'
import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { ForbiddenState } from '@/components/states/states'
import { useAuthStore } from '@/stores/auth-store'

export function RequireAuth() {
  const me = useAuthStore((s) => s.me)
  const location = useLocation()
  if (!me)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}

/** URL 直接入力時も画面単位で認可する（最終的な認可はバックエンドで実施） */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const role = useAuthStore((s) => s.me?.role)
  if (!role || !roles.includes(role)) return <ForbiddenState />
  return <>{children}</>
}
