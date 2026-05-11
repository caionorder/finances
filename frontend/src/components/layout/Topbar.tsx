import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronRight, KeyRound, LogOut, Menu } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useAuth } from '@/features/auth/AuthContext'
import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { SidebarContent } from './Sidebar'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const roleLabel: Record<'admin' | 'member' | 'viewer', string> = {
  admin: 'Administrador',
  member: 'Membro',
  viewer: 'Visualizador',
}

const roleBadgeStyle: Record<'admin' | 'member' | 'viewer', string> = {
  admin: 'bg-primary/10 text-primary border-primary/20',
  member: 'bg-secondary text-secondary-foreground border-border',
  viewer: 'bg-muted text-muted-foreground border-border',
}

const pageTitles: Record<string, { title: string; subtitle?: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Visão geral das finanças' },
  '/accounts': { title: 'Contas', subtitle: 'Gerencie suas contas bancárias' },
  '/credit-cards': { title: 'Cartões', subtitle: 'Controle limites e faturas' },
  '/transactions': { title: 'Transações', subtitle: 'Histórico de movimentações' },
  '/categories': { title: 'Categorias', subtitle: 'Organize receitas e despesas' },
  '/payables': { title: 'Pagar', subtitle: 'Compromissos pendentes' },
  '/receivables': { title: 'Receber', subtitle: 'Receitas previstas' },
  '/recurrences': { title: 'Recorrências', subtitle: 'Lançamentos automáticos' },
  '/facturas': { title: 'Faturas', subtitle: 'Documentos fiscais (PY)' },
  '/reports': { title: 'Relatórios', subtitle: 'Análises e visualizações' },
  '/settings': { title: 'Configurações', subtitle: 'Preferências do sistema' },
  '/users': { title: 'Usuários', subtitle: 'Gerenciamento de acesso' },
}

function getPageMeta(pathname: string) {
  if (pageTitles[pathname]) return pageTitles[pathname]
  const prefix = '/' + pathname.split('/')[1]
  return pageTitles[prefix] ?? { title: '', subtitle: undefined }
}

export function Topbar() {
  const { user, logout } = useAuth()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { pathname } = useLocation()
  const meta = getPageMeta(pathname)
  const isDetail = pathname.split('/').length > 2

  return (
    <header className="glass-strong sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {/* Mobile hamburger */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-64 border-r border-sidebar-border bg-sidebar p-0"
          >
            <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Title + breadcrumb */}
        <div className="flex min-w-0 flex-col">
          <div className="hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:flex">
            <span>App</span>
            {meta.title && (
              <>
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
                <span className="font-medium text-foreground/70">{meta.title}</span>
              </>
            )}
            {isDetail && (
              <>
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
                <span className="text-foreground/50">Detalhe</span>
              </>
            )}
          </div>
          <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {meta.title || 'Finances'}
          </h1>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <ThemeToggle />

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto gap-2.5 px-1.5 py-1.5 transition-colors hover:bg-accent/60 sm:px-2"
                aria-label="Menu do usuário"
              >
                <Avatar className="h-8 w-8 border border-border">
                  <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden flex-col items-start text-left md:flex">
                  <span className="text-sm font-medium leading-tight">{user.name}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="space-y-2 pb-3">
                <div className="flex items-center gap-2.5">
                  <Avatar className="h-9 w-9 border border-border">
                    <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">{user.name}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${roleBadgeStyle[user.role]}`}
                >
                  {roleLabel[user.role]}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPasswordOpen(true)} className="gap-2">
                <KeyRound className="h-4 w-4" />
                Trocar senha
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  void logout()
                }}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </header>
  )
}
