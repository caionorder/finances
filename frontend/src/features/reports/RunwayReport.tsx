import { useQuery } from '@tanstack/react-query'
import { Gauge } from 'lucide-react'
import { reportsApi, type RunwayStatus } from '@/lib/api/reports'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import type { SupportedCurrency } from './shared'

type Props = {
  currency: SupportedCurrency
}

const STATUS_META: Record<RunwayStatus, { label: string; tone: 'positive' | 'warning' | 'destructive' | 'neutral'; bar: string }> = {
  healthy: { label: 'Saudável', tone: 'positive', bar: 'bg-success' },
  warning: { label: 'Atenção', tone: 'warning', bar: 'bg-warning' },
  critical: { label: 'Crítico', tone: 'destructive', bar: 'bg-destructive' },
  unknown: { label: 'Sem dados', tone: 'neutral', bar: 'bg-muted-foreground' },
}

export function RunwayReport({ currency }: Props) {
  const query = useQuery({
    queryKey: ['reports', 'runway', { currency }],
    queryFn: () => reportsApi.runway({ currency_code: currency, target_months: 6 }),
    staleTime: 5 * 60_000,
  })

  const data = query.data
  const status: RunwayStatus = data?.status ?? 'unknown'
  const meta = STATUS_META[status]
  const months3 = data?.runway_months_3m ? parseFloat(data.runway_months_3m) : null
  const months6 = data?.runway_months_6m ? parseFloat(data.runway_months_6m) : null
  const months12 = data?.runway_months_12m ? parseFloat(data.runway_months_12m) : null
  const target = data?.target_months ?? 6
  const pct = months3 != null ? Math.min(100, Math.max(0, (months3 / (target * 2)) * 100)) : 0

  const toneText =
    meta.tone === 'positive'
      ? 'text-success'
      : meta.tone === 'warning'
        ? 'text-warning'
        : meta.tone === 'destructive'
          ? 'text-destructive'
          : 'text-muted-foreground'

  return (
    <div id="runway" className="rounded-xl border border-border/60 bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Gauge className="h-3 w-3 text-primary" strokeWidth={2.25} aria-hidden="true" />
            <span>Runway</span>
          </div>
          <h3 className="mt-1 text-[14px] font-semibold tracking-tight">
            Quantos meses duro · {currency}
          </h3>
        </div>
      </div>

      {query.isLoading ? (
        <div className="h-[140px] w-full animate-pulse rounded-lg bg-muted/60" />
      ) : query.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          Falha ao carregar runway.
        </div>
      ) : !data ? (
        <p className="text-xs text-muted-foreground">Sem dados.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className={cn('font-mono text-4xl font-semibold tabular-nums', toneText)}>
                  {months3 != null ? months3.toFixed(1) : '—'}
                </span>
                <span className="text-xs text-muted-foreground">meses (burn 3m)</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', meta.bar)} aria-hidden="true" />
                <span className={cn('font-mono text-[11px] uppercase tracking-widest', toneText)}>
                  {meta.label}
                </span>
                <span className="text-[11px] text-muted-foreground">· meta {target}m</span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Net worth
              </p>
              <p className="font-mono text-sm font-semibold tabular-nums">
                {formatCurrency(data.net_worth, currency)}
              </p>
            </div>
          </div>

          <div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className={cn('h-full transition-all', meta.bar)} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>0m</span>
              <span className="text-warning">{target}m</span>
              <span>{target * 2}m+</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-border/40 pt-4">
            <Burn label="Burn 3m" value={formatCurrency(data.burn_3m, currency)} months={months3} />
            <Burn label="Burn 6m" value={formatCurrency(data.burn_6m, currency)} months={months6} />
            <Burn label="Burn 12m" value={formatCurrency(data.burn_12m, currency)} months={months12} />
          </div>
        </div>
      )}
    </div>
  )
}

function Burn({ label, value, months }: { label: string; value: string; months: number | null }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono text-xs font-medium tabular-nums">{value}</p>
      <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
        {months != null ? `${months.toFixed(1)}m` : '—'}
      </p>
    </div>
  )
}
