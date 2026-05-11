import {
  Coins,
  Globe,
  History,
  KeyRound,
  Mail,
  Monitor,
  Moon,
  Settings,
  Shield,
  ShieldOff,
  Sun,
  User as UserIcon,
  Zap,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthContext'
import { useTheme } from '@/components/theme/ThemeProvider'
import { ApiKeysSection } from './ApiKeysSection'
import { AuditLogsSection } from './AuditLogsSection'
import { FxRatesSection } from './FxRatesSection'
import { cn } from '@/lib/utils'

const ROLE_LABEL: Record<'admin' | 'member' | 'viewer', string> = {
  admin: 'Administrador',
  member: 'Membro',
  viewer: 'Visualizador',
}

const ROLE_TONE: Record<'admin' | 'member' | 'viewer', string> = {
  admin: 'border-primary/30 bg-primary/10 text-primary',
  member: 'border-success/30 bg-success/10 text-success',
  viewer: 'border-border bg-muted/40 text-muted-foreground',
}

function GeneralSection() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-4">
      {/* Profile card */}
      <div className="rounded-xl border border-border/60 bg-card shadow-soft">
        <div className="border-b border-border/40 p-5">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Profile
          </div>
          <h3 className="mt-1 text-[15px] font-semibold tracking-tight">Sua conta</h3>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <InfoRow icon={UserIcon} label="Nome" value={user?.name ?? '—'} />
          <InfoRow icon={Mail} label="Email" value={user?.email ?? '—'} mono />
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/40 ring-1 ring-border">
              <Shield className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Role
              </span>
              {user?.role && (
                <span
                  className={cn(
                    'mt-1 inline-flex w-fit items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
                    ROLE_TONE[user.role]
                  )}
                >
                  {ROLE_LABEL[user.role]}
                </span>
              )}
            </div>
          </div>
          <InfoRow
            icon={Zap}
            label="Status"
            value={user?.is_active ? 'Ativo' : 'Inativo'}
            tone={user?.is_active ? 'success' : 'muted'}
          />
        </div>
      </div>

      {/* Appearance card */}
      <div className="rounded-xl border border-border/60 bg-card shadow-soft">
        <div className="border-b border-border/40 p-5">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Appearance
          </div>
          <h3 className="mt-1 text-[15px] font-semibold tracking-tight">Tema</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Escolha entre claro, escuro ou seguir o sistema operacional.
          </p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <ThemeOption
            value="light"
            current={theme}
            onSelect={setTheme}
            icon={Sun}
            label="Claro"
            hint="Fundo branco"
          />
          <ThemeOption
            value="dark"
            current={theme}
            onSelect={setTheme}
            icon={Moon}
            label="Escuro"
            hint="Fundo navy + glow"
          />
          <ThemeOption
            value="system"
            current={theme}
            onSelect={setTheme}
            icon={Monitor}
            label="Sistema"
            hint="Segue OS"
          />
        </div>
      </div>

      {/* About card */}
      <div className="rounded-xl border border-border/60 bg-card shadow-soft">
        <div className="border-b border-border/40 p-5">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            About
          </div>
          <h3 className="mt-1 text-[15px] font-semibold tracking-tight">Sobre o sistema</h3>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <Stat label="Versão" value="0.1.0" />
          <Stat label="Build" value="self-hosted" />
          <Stat label="Endpoints" value="76" />
        </div>
      </div>
    </div>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
  tone,
}: {
  icon: typeof Mail
  label: string
  value: string
  mono?: boolean
  tone?: 'success' | 'muted'
}) {
  const valueClass = cn(
    'mt-1 truncate text-sm',
    mono && 'font-mono',
    tone === 'success' && 'font-medium text-success',
    tone === 'muted' && 'text-muted-foreground'
  )
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/40 ring-1 ring-border">
        <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className={valueClass}>{value}</span>
      </div>
    </div>
  )
}

function ThemeOption({
  value,
  current,
  onSelect,
  icon: Icon,
  label,
  hint,
}: {
  value: 'light' | 'dark' | 'system'
  current: 'light' | 'dark' | 'system'
  onSelect: (v: 'light' | 'dark' | 'system') => void
  icon: typeof Sun
  label: string
  hint: string
}) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        'group relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active
          ? 'border-primary/40 bg-primary/5 shadow-[0_0_24px_-8px_var(--color-primary)]'
          : 'border-border/60 bg-background/50 hover:border-border hover:bg-accent/30'
      )}
      aria-pressed={active}
    >
      <div
        className={cn(
          'grid h-9 w-9 place-items-center rounded-lg ring-1 transition-colors',
          active
            ? 'bg-primary/15 text-primary ring-primary/30'
            : 'bg-muted/40 text-muted-foreground ring-border group-hover:bg-muted'
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold tracking-tight">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      {active && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-primary ring-1 ring-primary/30">
          Ativo
        </span>
      )}
    </button>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function AdminOnlyNotice() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-6 shadow-soft">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning ring-1 ring-warning/30">
        <ShieldOff className="h-4 w-4" strokeWidth={2.25} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold tracking-tight">Apenas administradores</p>
        <p className="text-sm text-muted-foreground">
          O gerenciamento de chaves de API é restrito a administradores.
        </p>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-2">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <Settings className="h-3 w-3 text-primary" strokeWidth={2.25} />
          <span>Configurações</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Preferências</h1>
        <p className="text-sm text-muted-foreground">Conta, aparência e integrações.</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList
          variant="line"
          className="w-full justify-start gap-4 overflow-x-auto border-b border-border/60 pb-0"
        >
          <TabsTrigger
            value="general"
            className="gap-1.5 px-2 pb-3 data-active:text-primary after:bg-primary after:bottom-[-1px]"
          >
            <UserIcon className="h-3.5 w-3.5" />
            Geral
          </TabsTrigger>
          <TabsTrigger
            value="api-keys"
            className="gap-1.5 px-2 pb-3 data-active:text-primary after:bg-primary after:bottom-[-1px]"
          >
            <KeyRound className="h-3.5 w-3.5" />
            API Keys
          </TabsTrigger>
          {isAdmin ? (
            <TabsTrigger
              value="audit"
              className="gap-1.5 px-2 pb-3 data-active:text-primary after:bg-primary after:bottom-[-1px]"
            >
              <History className="h-3.5 w-3.5" />
              Auditoria
            </TabsTrigger>
          ) : null}
          <TabsTrigger
            value="fx"
            className="gap-1.5 px-2 pb-3 data-active:text-primary after:bg-primary after:bottom-[-1px]"
          >
            <Coins className="h-3.5 w-3.5" />
            Cotações
          </TabsTrigger>
          <TabsTrigger
            value="locale"
            className="gap-1.5 px-2 pb-3 data-active:text-primary after:bg-primary after:bottom-[-1px]"
          >
            <Globe className="h-3.5 w-3.5" />
            Idioma
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <GeneralSection />
        </TabsContent>

        <TabsContent value="api-keys" className="mt-4">
          {isAdmin ? <ApiKeysSection /> : <AdminOnlyNotice />}
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          {isAdmin ? <AuditLogsSection /> : <AdminOnlyNotice />}
        </TabsContent>

        <TabsContent value="fx" className="mt-4">
          <FxRatesSection />
        </TabsContent>

        <TabsContent value="locale" className="mt-4">
          <div className="rounded-xl border border-border/60 bg-card shadow-soft">
            <div className="border-b border-border/40 p-5">
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                Locale
              </div>
              <h3 className="mt-1 text-[15px] font-semibold tracking-tight">Idioma e formato</h3>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-3">
              <InfoRow icon={Globe} label="Idioma" value="Português (Brasil)" />
              <InfoRow icon={Globe} label="Fuso" value="America/Sao_Paulo" mono />
              <InfoRow icon={Globe} label="Formato" value="DD/MM/YYYY" mono />
            </div>
            <div className="border-t border-border/40 px-5 py-3">
              <p className="text-xs text-muted-foreground">
                Locale é herdado do servidor. Para alterar, ajuste{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">TZ</code> no{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">.env</code> do
                backend.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
