import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Flame } from 'lucide-react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'
import { reportsApi } from '@/lib/api/reports'
import { formatCurrency } from '@/lib/currency'
import { formatBucketLabel, type SupportedCurrency } from './shared'

type Props = {
  currency: SupportedCurrency
}

export function BurnRateReport({ currency }: Props) {
  const query = useQuery({
    queryKey: ['reports', 'burn-rate', { currency }],
    queryFn: () => reportsApi.burnRate({ currency_code: currency }),
    staleTime: 5 * 60_000,
  })

  const data = query.data
  const chartData = useMemo(
    () =>
      (data?.by_month ?? []).map((m) => ({
        period: formatBucketLabel(m.period, 'month'),
        expense: parseFloat(m.expense),
      })),
    [data]
  )

  return (
    <Card title="Burn Rate" subtitle={`Despesa média mensal · ${currency}`} icon={Flame}>
      {query.isLoading ? (
        <Skeleton h={140} />
      ) : query.isError ? (
        <ErrorState msg="Falha ao carregar burn rate." />
      ) : !data ? (
        <EmptyState msg="Sem dados." />
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="space-y-3">
            <MetricRow label="3m" value={formatCurrency(data.burn_3m, currency)} />
            <MetricRow label="6m" value={formatCurrency(data.burn_6m, currency)} />
            <MetricRow label="12m" value={formatCurrency(data.burn_12m, currency)} />
          </div>
          <div className="col-span-2 h-[120px]">
            {chartData.length === 0 ? (
              <EmptyState msg="Sem despesa registrada." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="burnGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 9, fill: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-popover)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                    }}
                    formatter={(v) =>
                      typeof v === 'number' || typeof v === 'string'
                        ? formatCurrency(v, currency)
                        : ''
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    stroke="var(--color-destructive)"
                    strokeWidth={2}
                    fill="url(#burnGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function Card({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string
  subtitle: string
  icon: typeof Flame
  children: React.ReactNode
}) {
  return (
    <div id="burn-rate" className="rounded-xl border border-border/60 bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Icon className="h-3 w-3 text-primary" strokeWidth={2.25} aria-hidden="true" />
            <span>{title}</span>
          </div>
          <h3 className="mt-1 text-[14px] font-semibold tracking-tight">{subtitle}</h3>
        </div>
      </div>
      {children}
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono text-base font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function Skeleton({ h }: { h: number }) {
  return <div className="w-full animate-pulse rounded-lg bg-muted/60" style={{ height: h }} />
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/30 py-8 text-xs text-muted-foreground">
      {msg}
    </div>
  )
}

function ErrorState({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
      {msg}
    </div>
  )
}
