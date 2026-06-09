import { NavLink } from 'react-router-dom'
import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  LayoutDashboard,
  LineChart,
  Receipt,
  Repeat,
  Settings,
  Tags,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { RoleGate } from '@/features/auth/RoleGate'
import { cn } from '@/lib/utils'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

type NavSection = {
  label?: string
  items: NavItem[]
  adminOnly?: boolean
}

const sections: NavSection[] = [
  {
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Operações',
    items: [
      { to: '/accounts', label: 'Contas', icon: Wallet },
      { to: '/credit-cards', label: 'Cartões', icon: CreditCard },
      { to: '/investments', label: 'Investimentos', icon: LineChart },
      { to: '/transactions', label: 'Transações', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Fluxo',
    items: [
      { to: '/payables', label: 'Pagar', icon: TrendingDown },
      { to: '/receivables', label: 'Receber', icon: TrendingUp },
      { to: '/recurrences', label: 'Recorrências', icon: Repeat },
      { to: '/invoices', label: 'Invoices', icon: Receipt },
      { to: '/customers', label: 'Clientes', icon: Building2 },
    ],
  },
  {
    label: 'Documentos',
    items: [
      { to: '/facturas', label: 'Faturas', icon: FileText },
      { to: '/categories', label: 'Categorias', icon: Tags },
      { to: '/reports', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    label: 'Administração',
    adminOnly: true,
    items: [{ to: '/users', label: 'Usuários', icon: Users }],
  },
  {
    items: [{ to: '/settings', label: 'Configurações', icon: Settings }],
  },
]

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium',
          'transition-all duration-150 ease-out',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden="true"
              className="absolute -left-3 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-sidebar-primary shadow-[0_0_12px_var(--color-sidebar-primary)]"
            />
          )}
          <Icon
            className={cn(
              'h-[16px] w-[16px] shrink-0 transition-colors',
              isActive
                ? 'text-sidebar-primary'
                : 'text-sidebar-foreground/55 group-hover:text-sidebar-foreground'
            )}
            strokeWidth={isActive ? 2.25 : 1.75}
            aria-hidden="true"
          />
          <span className="truncate tracking-tight">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1.5 pt-4">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-sidebar-foreground/35">
        {children}
      </span>
    </div>
  )
}

function SectionBlock({
  section,
  onNavigate,
}: {
  section: NavSection
  onNavigate?: () => void
}) {
  const content = (
    <div className="space-y-0.5">
      {section.label && <SectionLabel>{section.label}</SectionLabel>}
      {section.items.map((item) => (
        <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
      ))}
    </div>
  )

  if (section.adminOnly) {
    return <RoleGate roles={['admin']}>{content}</RoleGate>
  }
  return content
}

/**
 * Inner sidebar content — used on both desktop (fixed) and mobile (Sheet drawer).
 */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="relative flex h-full flex-col bg-sidebar">
      {/* Subtle gradient glow at top */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-32 w-32 -translate-x-1/2 -translate-y-16 bg-glow-cyan opacity-40"
      />

      {/* Brand */}
      <div className="relative flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="relative grid h-9 w-9 place-items-center rounded-lg bg-sidebar-primary/15 ring-1 ring-sidebar-primary/30">
          <Zap
            className="h-[18px] w-[18px] text-sidebar-primary"
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-lg bg-sidebar-primary/10 blur-md"
          />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
            Finances
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground/40">
            v0.1 · self-hosted
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {sections.map((section, idx) => (
          <SectionBlock
            key={section.label ?? `s-${idx}`}
            section={section}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {/* Footer status */}
      <div className="relative border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="status-dot status-dot-pulse bg-success shadow-[0_0_8px_var(--color-success)]"
            aria-hidden="true"
          />
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground/40">
              Status
            </span>
            <span className="text-[11px] text-sidebar-foreground/70">Operacional</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Desktop fixed sidebar (hidden on mobile).
 */
export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-sidebar-border lg:block">
      <SidebarContent />
    </aside>
  )
}
