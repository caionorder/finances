import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mountain } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { reportsApi } from '@/lib/api/reports'
import { formatCurrency } from '@/lib/currency'
import { DateRangeFilter } from './DateRangeFilter'
import {
  firstDayOfMonth,
  formatBucketLabel,
  startOfMonthOffset,
  todayISO,
  CHART_PALETTE,
} from './shared'

const CONVERT_TO = 'USD'

export function NetWorthTrendReport() {
  const [from, setFrom] = useState(() => startOfMonthOffset(11))
  const [to, setTo] = useState(() => todayISO())

  const query = useQuery({
    queryKey: ['reports', 'net-worth-trend', { from, to, convert_to: CONVERT_TO }],
    queryFn: () => reportsApi.netWorthTrend({ from, to, convert_to: CONVERT_TO }),
    staleTime: 5 * 60_000,
    enabled: Boolean(from && to),
  })

  const { chartData, currencies } = useMemo(() => {
    const items = query.data?.items ?? []
    const allCurrencies = new Set<string>()
    for (const it of items) {
      for (const c of it.by_currency) {
        if (c.converted != null && parseFloat(c.converted) > 0) {
          allCurrencies.add(c.currency)
        }
      }
    }
    const currs = Array.from(allCurrencies)
    const rows = items.map((it) => {
      const row: Record<string, number | string | null> = {
        period: formatBucketLabel(it.period, 'month'),
        total: it.total_converted != null ? parseFloat(it.total_converted) : null,
      }
      for (const c of currs) {
        const match = it.by_currency.find((b) => b.currency === c)
        row[c] = match?.converted != null ? parseFloat(match.converted) : 0
      }
      return row
    })
    return { chartData: rows, currencies: currs }
  }, [query.data])

  return (
    <div id="net-worth-trend" className="rounded-xl border border-border/60 bg-card p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Mountain className="h-3 w-3 text-primary" strokeWidth={2.25} aria-hidden="true" />
            <span>Net Worth Trend</span>
          </div>
          <h3 className="mt-1 text-[14px] font-semibold tracking-tight">
            Patrimônio mensal · ≈ {CONVERT_TO}
          </h3>
        </div>
        <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={(v) => setTo(v || firstDayOfMonth())} />
      </div>

      {query.isLoading ? (
        <div className="h-[280px] w-full animate-pulse rounded-lg bg-muted/60" />
      ) : query.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          Falha ao carregar net worth.
        </div>
      ) : chartData.length === 0 ? (
        <EmptyState msg="Sem dados no período." />
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {currencies.map((c, i) => (
                  <linearGradient key={c} id={`nwt-${c}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_PALETTE[i % CHART_PALETTE.length]} stopOpacity={0.65} />
                    <stop offset="100%" stopColor={CHART_PALETTE[i % CHART_PALETTE.length]} stopOpacity={0.1} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border)" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)', fontFamily: 'var(--font-mono)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) =>
                  new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
                }
                width={56}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-popover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
                formatter={(v, name) => {
                  if (v == null) return ['—', String(name)]
                  const n = typeof v === 'number' ? v : parseFloat(String(v))
                  return [formatCurrency(n, CONVERT_TO), String(name)]
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}
                iconType="circle"
                iconSize={8}
              />
              {currencies.map((c, i) => (
                <Area
                  key={c}
                  type="monotone"
                  dataKey={c}
                  stackId="1"
                  name={c}
                  stroke={CHART_PALETTE[i % CHART_PALETTE.length]}
                  strokeWidth={1.5}
                  fill={`url(#nwt-${c})`}
                />
              ))}
              <Line
                type="monotone"
                dataKey="total"
                name="Total"
                stroke="var(--color-foreground)"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/30 py-10 text-xs text-muted-foreground">
      {msg}
    </div>
  )
}
