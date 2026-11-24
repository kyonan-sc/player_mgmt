import {
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Settings,
  UserCog,
  Users,
  Layers,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useMe } from '@/features/auth/use-me'
import { useAuthActions, useSessionExpiry } from '@/features/auth/use-auth'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils'
import { BrandMark } from './BrandMark'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  end?: boolean
}

const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'ダッシュボード', icon: LayoutDashboard, end: true },
  { to: '/players', label: '選手', icon: Users },
  { to: '/assessments', label: '選手評価', icon: ClipboardCheck },
  { to: '/teams', label: 'チーム編成', icon: Layers },
]

const ADMIN_NAV: NavItem[] = [
  { to: '/settings/criteria', label: '評価基準', icon: ListChecks },
  { to: '/settings/coaches', label: 'コーチ管理', icon: UserCog },
  { to: '/settings', label: 'システム設定', icon: Settings, end: true },
]

const ROLE_LABEL = { admin: '管理者', coach: 'コーチ', viewer: '閲覧者' } as const

function isActivePath(pathname: string, item: NavItem): boolean {
  if (item.end) return pathname === item.to
  return (
    pathname === item.to ||
    pathname.startsWith(`${item.to}/`) ||
    (item.to === '/assessments' && pathname.startsWith('/results'))
  )
}

function AppSidebar() {
  const { pathname } = useLocation()
  const { me, isAdmin } = useMe()
  const { signOut } = useAuthActions()
  const { setOpenMobile } = useSidebar()
  const renderItems = (items: NavItem[]) =>
    items.map((item) => (
      <SidebarMenuItem key={item.to}>
        <SidebarMenuButton
          asChild
          isActive={isActivePath(pathname, item)}
          tooltip={item.label}
          className="h-10 text-[14px]"
        >
          <Link to={item.to} onClick={() => setOpenMobile(false)}>
            <item.icon />
            <span>{item.label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <Link
          to="/"
          className="flex items-center gap-2.5 overflow-hidden"
          onClick={() => setOpenMobile(false)}
        >
          <BrandMark className="size-8 shrink-0" />
          <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-semibold">境南SC</div>
            <div className="truncate text-xs text-muted-foreground">選手評価管理</div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(MAIN_NAV)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {/* 管理者専用画面は管理者以外のナビゲーションに表示しない（要件 10章） */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>設定</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(ADMIN_NAV)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t p-3 group-data-[collapsible=icon]:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-sm leading-tight">
            <div className="truncate font-medium">{me?.displayName}</div>
            <div className="truncate text-xs text-muted-foreground">
              {me ? ROLE_LABEL[me.role] : ''}
            </div>
          </div>
          <Button variant="ghost" size="icon" aria-label="ログアウト" onClick={() => signOut()}>
            <LogOut />
          </Button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function UserMenu() {
  const { me } = useMe()
  const { signOut } = useAuthActions()
  if (!me) return null
  const initial = me.displayName.slice(0, 1)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="アカウントメニュー"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initial}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{me.displayName}</div>
          <div className="truncate text-xs text-muted-foreground">{me.email}</div>
          <div className="mt-1 text-xs text-muted-foreground">権限：{ROLE_LABEL[me.role]}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOut /> ログアウト
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileBottomNav() {
  const { setOpenMobile } = useSidebar()
  const { pathname } = useLocation()
  const items = [
    { to: '/', label: 'ホーム', icon: LayoutDashboard, end: true },
    { to: '/players', label: '選手', icon: Users },
    { to: '/assessments', label: '評価', icon: ClipboardCheck },
    { to: '/teams', label: 'チーム', icon: Layers },
  ]
  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-card/85 md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={() =>
                cn(
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground',
                  isActivePath(pathname, item) && 'font-semibold text-primary',
                )
              }
            >
              <item.icon className="size-5" />
              {item.label}
            </NavLink>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            className="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground"
          >
            <MoreHorizontal className="size-5" />
            その他
          </button>
        </li>
      </ul>
    </nav>
  )
}

export function MockBanner() {
  if (!env.useMock) return null
  return (
    <div
      className="bg-warning/10 px-4 py-1.5 text-center text-xs font-medium text-warning pt-safe"
      role="note"
    >
      モック環境 — 表示されているデータはすべて架空のものです
    </div>
  )
}

export function AppShell() {
  useSessionExpiry()
  const isInputScreen = useMatch('/assessments/:cycleId/players/:playerId') !== null
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0 bg-background">
        <MockBanner />
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-6">
          <SidebarTrigger className="hidden md:inline-flex" />
          <Link to="/" className="flex items-center gap-2 md:hidden">
            <BrandMark className="size-7" />
            <span className="text-sm font-semibold">境南SC</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {env.appEnv !== 'production' && (
              <span className="rounded-md border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground uppercase">
                {env.appEnv}
              </span>
            )}
            <UserMenu />
          </div>
        </header>
        <main
          className={cn(
            'mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8',
            isInputScreen ? 'pb-40' : 'pb-24 md:pb-10',
          )}
        >
          <Outlet />
        </main>
        {!isInputScreen && <MobileBottomNav />}
      </SidebarInset>
    </SidebarProvider>
  )
}
