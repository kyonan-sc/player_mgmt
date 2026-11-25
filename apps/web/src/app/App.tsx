import type { Role } from '@kyonan/shared'
import { QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { createHashRouter, Navigate, RouterProvider, type RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { NetworkStatus } from '@/components/layout/NetworkStatus'
import { LoadingState, NotFoundState } from '@/components/states/states'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RequireAuth, RequireRole } from '@/features/auth/guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { createQueryClient } from '@/lib/query'

const ADMIN: Role[] = ['admin']
const EVALUATORS: Role[] = ['admin', 'coach']

/** 画面単位でコード分割し、スマートフォンでの初回表示を軽くする */
function page(
  load: () => Promise<ComponentType>,
  roles?: Role[],
): Pick<RouteObject, 'lazy' | 'hydrateFallbackElement'> {
  return {
    hydrateFallbackElement: <LoadingState />,
    lazy: async () => {
      const Page = await load()
      return {
        Component: roles
          ? () => (
              <RequireRole roles={roles}>
                <Page />
              </RequireRole>
            )
          : Page,
      }
    },
  }
}

function FullScreenSpinner() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center text-muted-foreground"
      aria-busy="true"
    >
      <Loader2 className="size-6 animate-spin" />
    </div>
  )
}

/** GitHub Pages での直接アクセス・リロード時の 404 を避けるため HashRouter 方式を使用する */
function createAppRouter() {
  return createHashRouter([
    { path: '/login', element: <LoginPage /> },
    {
      path: '/dev/connectivity',
      hydrateFallbackElement: <FullScreenSpinner />,
      lazy: async () => ({
        Component: (await import('@/features/dev/ConnectivityPage')).ConnectivityPage,
      }),
    },
    {
      element: <RequireAuth />,
      hydrateFallbackElement: <FullScreenSpinner />,
      children: [
        {
          element: <AppShell />,
          children: [
            {
              index: true,
              ...page(
                async () => (await import('@/features/dashboard/DashboardPage')).DashboardPage,
              ),
            },
            {
              path: 'players',
              ...page(async () => (await import('@/features/players/PlayersPage')).PlayersPage),
            },
            {
              path: 'players/new',
              ...page(
                async () => (await import('@/features/players/PlayerFormPage')).PlayerFormPage,
                ADMIN,
              ),
            },
            {
              path: 'players/:id',
              ...page(
                async () => (await import('@/features/players/PlayerDetailPage')).PlayerDetailPage,
              ),
            },
            {
              path: 'players/:id/edit',
              ...page(
                async () => (await import('@/features/players/PlayerFormPage')).PlayerFormPage,
                ADMIN,
              ),
            },
            {
              path: 'assessments',
              ...page(
                async () => (await import('@/features/assessment-cycles/CyclesPage')).CyclesPage,
              ),
            },
            {
              path: 'assessments/:cycleId',
              ...page(
                async () =>
                  (await import('@/features/assessment-cycles/CycleDetailPage')).CycleDetailPage,
                EVALUATORS,
              ),
            },
            {
              path: 'assessments/:cycleId/players/:playerId',
              ...page(
                async () =>
                  (await import('@/features/assessments/AssessmentInputPage')).AssessmentInputPage,
                EVALUATORS,
              ),
            },
            {
              path: 'results/:cycleId',
              ...page(async () => (await import('@/features/assessments/ResultsPage')).ResultsPage),
            },
            {
              path: 'teams',
              ...page(async () => (await import('@/features/teams/TeamsPage')).TeamsPage),
            },
            {
              path: 'settings',
              ...page(
                async () => (await import('@/features/settings/SettingsPage')).SettingsPage,
                ADMIN,
              ),
            },
            {
              path: 'settings/criteria',
              ...page(
                async () => (await import('@/features/settings/CriteriaPage')).CriteriaPage,
                EVALUATORS,
              ),
            },
            {
              path: 'settings/coaches',
              ...page(
                async () => (await import('@/features/settings/CoachesPage')).CoachesPage,
                ADMIN,
              ),
            },
            { path: '*', element: <NotFoundState /> },
          ],
        },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ])
}

export function App() {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(createAppRouter)
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <NetworkStatus />
        <RouterProvider router={router} />
        {/* 通信待ちのメッセージ（NetworkStatus）と重ならないよう、トーストは少し下に出す */}
        <Toaster
          position="top-center"
          offset={{ top: 72 }}
          mobileOffset={{ top: 72 }}
          closeButton
        />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
