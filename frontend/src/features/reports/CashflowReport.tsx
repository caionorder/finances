import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, TrendingUp, ListOrdered } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { reportsApi, type CashflowGroupBy } from '@/lib/api/reports'
import { formatCurrency } from '@/lib/currency'
import { downloadCsv } from '@/lib/csv'
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

export function CashflowReport({ currency }: Props) {
  const [from, setFrom] = useState<string>(() => startOfMonthOffset(5))
  const [to, setTo] = useState<string>(() => todayISO())
  const [groupBy, setGroupBy] = useState<CashflowGroupBy>('month')

  const query = useQuery({
    queryKey: ['reports', 'cashflow', { currency, from, to, group_by: groupBy }],
    queryFn: () =>
      reportsApi.cashflow({ currency, from, to, group_by: groupBy }),
    enabled: Boolean(from && to),
  })

  const data = query.data
  const buckets = data?.buckets ?? []

  const chartData = useMemo(
    () =>
      buckets.map((b) => ({
        period: formatBucketLabel(b.period, groupBy),
        income: parseFloat(b.income),
        expense: parseFloat(b.expense),
        net: parseFloat(b.net),
      })),
    [buckets, groupBy]
  )

  function handleExport() {
    if (!data) return
    const rows = buckets.map((b) => ({
      periodo: b.period,
      receitas: b.income,
      despesas: b.expense,
      saldo: b.net,
    }))
    rows.push({
      periodo: 'TOTAL',
      receitas: data.totals.income,
      despesas: data.totals.expense,
      saldo: data.totals.net,
    })
    downloadCsv(
      rows,
      ['periodo', 'receitas', 'despesas', 'saldo'],
      `fluxo-de-caixa_${currency}_${from}_${to}.csv`
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-soft">
        <DateRangeFilter
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={(v) => setTo(v || firstDayOfMonth())}
        />
        <div className="space-y-1">
          <span className="block font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Agrupar por
          </span>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as CashflowGroupBy)}>
            <SelectTrigger className="h-9 w-[140px] border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Mensal</SelectItem>
              <SelectItem value="week">Semanal</SelectItem>
              <SelectItem value="day">Diário</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          className="ml-auto h-9"
          onClick={handleExport}
          disabled={!data || buckets.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      <div className="rounded-xl border border-border/60 bg-card shadow-soft">
        <div className="flex items-center justify-between border-b border-border/40 p-5">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-primary" strokeWidth={2.25} />
              <span>Cashflow</span>
            </div>
            <h3 className="mt-1 text-[15px] font-semibold tracking-tight">
              Fluxo de caixa · {currency}
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <LegendDot color="var(--color-success)" label="Receitas" />
            <LegendDot color="var(--color-destructive)" label="Despesas" />
          </div>
        </div>
        <div className="p-3 sm:p-5">
          {query.isLoading ? (
            <div className="h-[320px] w-full animate-pulse rounded-lg bg-muted/60" />
          ) : query.isError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              Falha ao carregar fluxo de caixa.
            </div>
          ) : buckets.length === 0 ? (
            <EmptyState msg="Sem dados para o período selecionado." />
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  barCategoryGap="22%"
                >
                  <CartesianGrid
                    strokeDasharray="2 4"
                    vertical={false}
                    stroke="var(--color-border)"
                    strokeOpacity={0.6}
                  />
                  <XAxis
                    dataKey="period"
                    tick={{
                      fontSize: 11,
                      fill: 'var(--color-muted-foreground)',
                      fontFamily: 'var(--font-mono)',
                    }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{
                      fontSize: 10,
                      fill: 'var(--color-muted-foreground)',
                      fontFamily: 'var(--font-mono)',
                    }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      new Intl.NumberFormat('pt-BR', {
                        notation: 'compact',
                        maximumFractionDigits: 1,
                      }).format(v)
                    }
                    width={56}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--color-accent)', opacity: 0.4 }}
                    contentStyle={{
                      backgroundColor: 'var(--color-popover)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      boxShadow: 'var(--shadow-pop)',
                    }}
                    labelStyle={{
                      color: 'var(--color-foreground)',
                      fontWeight: 600,
                      fontFamily: 'var(--font-sans)',
                    }}
                    formatter={(v) =>
                      typeof v === 'number' || typeof v === 'string'
                        ? formatCurrency(v, currency)
                        : ''
                    }
                  />
                  <Bar
                    dataKey="income"
                    name="Receitas"
                    fill="var(--color-success)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                  />
                  <Bar
                    dataKey="expense"
                    name="Despesas"
                    fill="var(--color-destructive)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
        <div className="flex items-start justify-between border-b border-border/40 p-5">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <ListOrdered className="h-3 w-3 text-primary" strokeWidth={2.25} />
              <span>Detalhamento</span>
            </div>
            <h3 className="mt-1 text-[15px] font-semibold tracking-tight">
              Por período
            </h3>
          </div>
        </div>
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-b border-border/60 hover:bg-transparent">
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Período
              </TableHead>
              <TableHead className="px-4 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Receitas
              </TableHead>
              <TableHead className="px-4 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Despesas
              </TableHead>
              <TableHead className="px-4 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Saldo
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  {query.isLoading ? 'Carregando...' : 'Sem registros.'}
                </TableCell>
              </TableRow>
            ) : (
              buckets.map((b) => {
                const net = parseFloat(b.net)
                return (
                  <TableRow
                    key={b.period}
                    className="border-b border-border/40 transition-colors hover:bg-accent/30"
                  >
                    <TableCell className="px-4 py-3 font-mono text-sm tabular-nums">
                      {formatBucketLabel(b.period, groupBy)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono text-sm tabular-nums text-success">
                      {formatCurrency(b.income, currency)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono text-sm tabular-nums text-destructive">
                      {formatCurrency(b.expense, currency)}
                    </TableCell>
                    <TableCell
                      className={`px-4 py-3 text-right font-mono text-sm font-medium tabular-nums ${
                        net >= 0 ? 'text-success' : 'text-destructive'
                      }`}
                    >
                      {formatCurrency(b.net, currency)}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
          {data && buckets.length > 0 ? (
            <TableFooter className="bg-muted/40">
              <TableRow className="border-t border-border/60 hover:bg-transparent">
                <TableCell className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Total
                </TableCell>
                <TableCell className="px-4 py-3 text-right font-mono text-sm font-semibold tabular-nums text-success">
                  {formatCurrency(data.totals.income, currency)}
                </TableCell>
                <TableCell className="px-4 py-3 text-right font-mono text-sm font-semibold tabular-nums text-destructive">
                  {formatCurrency(data.totals.expense, currency)}
                </TableCell>
                <TableCell
                  className={`px-4 py-3 text-right font-mono text-sm font-semibold tabular-nums ${
                    parseFloat(data.totals.net) >= 0 ? 'text-success' : 'text-destructive'
                  }`}
                >
                  {formatCurrency(data.totals.net, currency)}
                </TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
        aria-hidden="true"
      />
      {label}
    </div>
  )
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/30 px-6 py-16 text-center text-sm text-muted-foreground">
      {msg}
    </div>
  )
}
