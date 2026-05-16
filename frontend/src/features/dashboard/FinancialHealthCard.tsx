import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  HeartPulse,
  PiggyBank,
  RefreshCw,
} from 'lucide-react'
import type { FinancialHealthReport } from '@/lib/api/reports'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'

const HEALTH_CURRENCY = 'USD'

type Props = {
  loading: boolean
  isError: boolean
  data?: FinancialHealthReport
  onRetry?: () => void
}

export function FinancialHealthCard({ loading, isError, data, onRetry }: Props) {
  const total = data?.total_health
  const totalNum = total != null ? parseFloat(total) : null
  const isNegative = totalNum != null && totalNum < 0
  const monthLabel = data?.month_start ? formatMonthYearBR(data.month_start) : null

  const heroTone = isNegative ? 'text-destructive' : 'text-success'
  const heroIconTone = isNegative
    ? 'bg-destructive/15 text-destructive ring-destructive/30 shadow-[0_0_18px_-4px_var(--color-destructive)]'
    : 'bg-success/15 text-success ring-success/30 shadow-[0_0_18px_-4px_var(--color-success)]'
  const heroGlow = isNegative ? 'bg-glow-cyan' : 'bg-glow-emerald'

  return (
    <section
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-card shadow-soft transition-all duration-200',
        'border-primary/30 hover:border-primary/50 hover:shadow-elevated'
      )}
      aria-label="Saúde financeira"
    >
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -top-24 -right-20 h-72 w-72 opacity-30 transition-opacity duration-500 group-hover:opacity-45',
          heroGlow
        )}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 bg-glow-cyan opacity-20"
      />

      <div className="relative space-y-6 p-6 sm:p-7">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <div
                className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30 shadow-[0_0_16px_-4px_var(--color-primary)]"
                aria-hidden="true"
              >
                <HeartPulse className="h-3.5 w-3.5" strokeWidth={2.25} />
              </div>
              <span>Saúde financeira</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[15px] font-semibold tracking-tight">
                Patrimônio + caixa + investimentos
              </h2>
              {monthLabel ? (
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  {monthLabel}
                </span>
              ) : null}
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-widest text-primary">
            Valores em {HEALTH_CURRENCY}
          </span>
        </header>

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Saúde total
            </span>
            {loading ? (
              <div className="h-14 w-72 animate-pulse rounded-md bg-muted" />
            ) : isError ? (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <span>Falha ao carregar saúde financeira.</span>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Tentar de novo
                  </button>
                ) : null}
              </div>
            ) : (
              <p
                className={cn(
                  'font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl lg:text-6xl',
                  heroTone
                )}
              >
                {total != null ? formatCurrency(total, HEALTH_CURRENCY) : '—'}
              </p>
            )}
          </div>
          {!loading && !isError && total != null ? (
            <div
              className={cn(
                'grid h-12 w-12 place-items-center rounded-xl ring-1 transition-shadow sm:h-14 sm:w-14',
                heroIconTone
              )}
              aria-hidden="true"
            >
              <HeartPulse className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.25} />
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MiniKpi
            icon={ArrowUpRight}
            label="Entrou (mês)"
            value={data?.incoming_month}
            tone="positive"
            loading={loading}
          />
          <MiniKpi
            icon={ArrowDownRight}
            label="Saiu (mês)"
            value={data?.outgoing_month}
            tone="negative"
            loading={loading}
          />
          <MiniKpi
            icon={CalendarClock}
            label="Pendentes do mês"
            value={data?.pending_payables_month}
            tone="warning"
            loading={loading}
          />
          <MiniKpi
            icon={PiggyBank}
            label="Investimentos"
            value={data?.total_investments}
            tone="info"
            loading={loading}
          />
        </div>
      </div>
    </section>
  )
}

type MiniTone = 'positive' | 'negative' | 'warning' | 'info'

function MiniKpi({
  icon: Icon,
  label,
  value,
  tone,
  loading,
}: {
  icon: typeof ArrowUpRight
  label: string
  value: string | undefined
  tone: MiniTone
  loading: boolean
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-success'
      : tone === 'negative'
        ? 'text-destructive'
        : tone === 'warning'
          ? 'text-warning'
          : 'text-foreground'

  const iconClass =
    tone === 'positive'
      ? 'bg-success/15 text-success ring-success/30'
      : tone === 'negative'
        ? 'bg-destructive/15 text-destructive ring-destructive/30'
        : tone === 'warning'
          ? 'bg-warning/15 text-warning ring-warning/30'
          : 'bg-primary/15 text-primary ring-primary/30'

  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-4 backdrop-blur-sm transition-colors hover:border-border">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span
          className={cn('grid h-7 w-7 place-items-center rounded-md ring-1', iconClass)}
          aria-hidden="true"
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
      </div>
      {loading ? (
        <div className="mt-3 h-6 w-24 animate-pulse rounded-md bg-muted" />
      ) : (
        <p
          className={cn(
            'mt-2 font-mono text-lg font-semibold tracking-tight tabular-nums sm:text-xl',
            valueClass
          )}
        >
          {value != null ? formatCurrency(value, HEALTH_CURRENCY) : '—'}
        </p>
      )}
    </div>
  )
}

function formatMonthYearBR(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  if (!y || !m) return iso
  const d = new Date(y, m - 1, 1)
  const raw = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}
