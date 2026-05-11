import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PiggyBank } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { reportsApi } from '@/lib/api/reports'
import { DateRangeFilter } from './DateRangeFilter'
import {
  firstDayOfMonth,
  formatBucketLabel,
  startOfMonthOffset,
  todayISO,
  type SupportedCurrency,
} from './shared'

type Props = {
  currency: SupportedCurrency
}

const TARGET_PCT = 0.2

export function SavingsRateReport({ currency }: Props) {
  const [from, setFrom] = useState(() => startOfMonthOffset(11))
  const [to, setTo] = useState(() => todayISO())

  const query = useQuery({
    queryKey: ['reports', 'savings-rate', { currency, from, to }],
    queryFn: () => reportsApi.savingsRate({ currency_code: currency, from, to }),
    staleTime: 5 * 60_000,
    enabled: Boolean(from && to),
  })

  const chartData = useMemo(() => {
    return (query.data?.items ?? []).map((it) => ({
      period: formatBucketLabel(it.period, 'month'),
      rate: it.savings_rate != null ? parseFloat(it.savings_rate) : null,
    }))
  }, [query.data])

  const avg3m = query.data?.avg_3m ? parseFloat(query.data.avg_3m) : null
  const avg12m = query.data?.avg_12m ? parseFloat(query.data.avg_12m) : null

  return (
    <div id="savings-rate" className="rounded-xl border border-border/60 bg-card p-5 shadow-soft">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <PiggyBank className="h-3 w-3 text-primary" strokeWidth={2.25} aria-hidden="true" />
            <span>Savings Rate</span>
          </div>
          <h3 className="mt-1 text-[14px] font-semibold tracking-tight">
            Taxa de poupança · {currency}
          </h3>
        </div>
        <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={(v) => setTo(v || firstDayOfMonth())} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
        <Chip label="Média 3m" value={fmtPct(avg3m)} />
        <Chip label="Média 12m" value={fmtPct(avg12m)} />
        <Chip label="Meta" value={`${(TARGET_PCT * 100).toFixed(0)}%`} accent />
      </div>

      {query.isLoading ? (
        <div className="h-[220px] w-full animate-pulse rounded-lg bg-muted/60" />
      ) : query.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          Falha ao carregar savings rate.
        </div>
      ) : chartData.length === 0 ? (
        <EmptyState msg="Sem dados no período." />
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-popover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
                formatter={(v) => {
                  if (v == null) return ['—', '']
                  const n = typeof v === 'number' ? v : parseFloat(String(v))
                  return [`${(n * 100).toFixed(1)}%`, 'Savings rate']
                }}
              />
              <ReferenceLine
                y={TARGET_PCT}
                stroke="var(--color-warning)"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="var(--color-success)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'var(--color-success)' }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function fmtPct(v: number | null): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function Chip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] tabular-nums ${
        accent
          ? 'border-warning/40 bg-warning/10 text-warning'
          : 'border-border/60 bg-muted/30 text-muted-foreground'
      }`}
    >
      <span className="uppercase tracking-widest">{label}</span>
      <span className="font-semibold">{value}</span>
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
