import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Decimal from 'decimal.js'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Coins,
  CreditCard,
  Gauge,
  Globe2,
  PiggyBank,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '@/features/auth/AuthContext'
import { UpcomingPayablesWidget } from '@/features/dashboard/UpcomingPayablesWidget'
import { CurrencySelector } from '@/features/reports/CurrencySelector'
import {
  CHART_PALETTE,
  FIAT_CURRENCIES,
  firstDayOfMonth,
  formatBucketLabel,
  lastDayOfMonth,
  startOfMonthOffset,
  TOTAL_OPTION,
  todayISO,
  type CurrencyOrTotal,
  type SupportedCurrency,
} from '@/features/reports/shared'
import { reportsApi, type RunwayStatus } from '@/lib/api/reports'
import { payablesApi } from '@/lib/api/payables'
import { receivablesApi } from '@/lib/api/receivables'
import { fxApi, type FxRateOut } from '@/lib/api/fx'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'

const CONVERT_TO = 'USD'

function rateOf(rates: FxRateOut[] | undefined, base: string, quote: string): number | null {
  if (!rates) return null
  if (base === quote) return 1
  const direct = rates.find((r) => r.base_code === base && r.quote_code === quote)
  if (direct) return parseFloat(direct.rate)
  const rev = rates.find((r) => r.base_code === quote && r.quote_code === base)
  if (rev) return 1 / parseFloat(rev.rate)
  for (const inter of ['USD', 'BRL']) {
    const a = rates.find((r) => r.base_code === base && r.quote_code === inter)
    const b = rates.find((r) => r.base_code === inter && r.quote_code === quote)
    if (a && b) return parseFloat(a.rate) * parseFloat(b.rate)
    const c = rates.find((r) => r.base_code === inter && r.quote_code === base)
    const d = rates.find((r) => r.base_code === inter && r.quote_code === quote)
    if (c && d && parseFloat(c.rate) !== 0) return (1 / parseFloat(c.rate)) * parseFloat(d.rate)
  }
  return null
}

function convertToTarget(
  amount: Decimal,
  from: string,
  target: string,
  rates: FxRateOut[] | undefined
): Decimal | null {
  if (from === target) return amount
  const r = rateOf(rates, from, target)
  if (r != null) return amount.mul(r)
  return null
}

const TOP_N = 8

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export default function Home() {
  const { user } = useAuth()
  const [selected, setSelected] = useState<CurrencyOrTotal>('BRL')
  const isTotal = selected === TOTAL_OPTION
  const displayCurrency: SupportedCurrency = isTotal ? CONVERT_TO : selected

  // Pra TOTAL: charts continuam mostrando uma moeda específica (USD), com aviso
  // Pra cripto puro: backend filtra por currency_code BTC/USDT — pouco dado mas funciona
  const chartCurrency: SupportedCurrency = isTotal ? CONVERT_TO : selected

  const monthFrom = firstDayOfMonth()
  const monthTo = lastDayOfMonth()
  const sixMonthsFrom = startOfMonthOffset(5)
  const sixMonthsTo = todayISO()

  // Quando TOTAL: pede net-worth com convert_to=USD (backend agrega tudo)
  const netWorthParams = isTotal
    ? { as_of: sixMonthsTo, convert_to: CONVERT_TO }
    : { as_of: sixMonthsTo }

  const results = useQueries({
    queries: [
      {
        queryKey: ['dashboard', 'net-worth', netWorthParams],
        queryFn: () => reportsApi.netWorth(netWorthParams),
      },
      {
        queryKey: ['dashboard', 'cashflow-month', { currency: chartCurrency, from: monthFrom, to: monthTo }],
        queryFn: () =>
          reportsApi.cashflow({ currency: chartCurrency, from: monthFrom, to: monthTo, group_by: 'month' }),
      },
      {
        queryKey: ['dashboard', 'cashflow-6mo', { currency: chartCurrency, from: sixMonthsFrom, to: sixMonthsTo }],
        queryFn: () =>
          reportsApi.cashflow({
            currency: chartCurrency,
            from: sixMonthsFrom,
            to: sixMonthsTo,
            group_by: 'month',
          }),
      },
      {
        queryKey: [
          'dashboard',
          'by-category-month',
          { currency: chartCurrency, from: monthFrom, to: monthTo, kind: 'expense' },
        ],
        queryFn: () =>
          reportsApi.byCategory({ currency: chartCurrency, from: monthFrom, to: monthTo, kind: 'expense' }),
      },
      ...(isTotal
        ? FIAT_CURRENCIES.flatMap((c) => [
            {
              queryKey: ['dashboard', 'payables-outstanding-multi', c],
              queryFn: () => payablesApi.outstandingSummary({ currency_code: c }),
              staleTime: 5 * 60_000,
            },
            {
              queryKey: ['dashboard', 'receivables-outstanding-multi', c],
              queryFn: () => receivablesApi.outstandingSummary({ currency_code: c }),
              staleTime: 5 * 60_000,
            },
          ])
        : [
            {
              queryKey: ['dashboard', 'payables-outstanding', { currency: selected }],
              queryFn: () => payablesApi.outstandingSummary({ currency_code: selected }),
              staleTime: 5 * 60_000,
            },
            {
              queryKey: ['dashboard', 'receivables-outstanding', { currency: selected }],
              queryFn: () => receivablesApi.outstandingSummary({ currency_code: selected }),
              staleTime: 5 * 60_000,
            },
          ]),
    ],
  })

  const fxQ = useQuery({
    queryKey: ['fx-rates'],
    queryFn: () => fxApi.list(),
    staleTime: 5 * 60_000,
    enabled: isTotal,
  })

  // Phase C — Runway + Currency Exposure widgets on dashboard
  const runwayCurrency: SupportedCurrency = isTotal ? CONVERT_TO : selected
  const runwayQ = useQuery({
    queryKey: ['dashboard', 'runway', { currency: runwayCurrency }],
    queryFn: () =>
      reportsApi.runway({ currency_code: runwayCurrency, target_months: 6 }),
    staleTime: 5 * 60_000,
  })

  const currencyExposureQ = useQuery({
    queryKey: ['dashboard', 'currency-exposure', { convert_to: CONVERT_TO }],
    queryFn: () => reportsApi.currencyExposure({ convert_to: CONVERT_TO }),
    staleTime: 5 * 60_000,
  })

  const netWorthQ = results[0] as { data?: any; isLoading: boolean; isError: boolean }
  const cashflowMonthQ = results[1] as { data?: any; isLoading: boolean; isError: boolean }
  const cashflow6moQ = results[2] as { data?: any; isLoading: boolean; isError: boolean }
  const byCategoryQ = results[3] as { data?: any; isLoading: boolean; isError: boolean }
  const flowQs = results.slice(4) as Array<{ data?: any; isLoading: boolean; isError: boolean }>
  const isLoading = results.some((q) => q.isLoading) || (isTotal && fxQ.isLoading)
  const errorQ = results.find((q) => q.isError)

  // Saldo total — quando TOTAL: usa total_converted; senão: filtra by_currency
  const netForCurrency = useMemo(() => {
    if (isTotal) {
      return netWorthQ.data?.total_converted ?? null
    }
    const groups = netWorthQ.data?.by_currency ?? []
    const match = groups.find((g: any) => g.currency === selected)
    return match?.net ?? null
  }, [netWorthQ.data, selected, isTotal])

  const expensesMonth = cashflowMonthQ.data?.totals.expense ?? null
  const incomeMonth = cashflowMonthQ.data?.totals.income ?? null

  // Payables/Receivables — usa outstanding-summary (inclui pending+overdue+partial).
  // TOTAL: agrega por moeda via FX; sinaliza missingFx quando alguma moeda fica sem rate.
  const { payablesSum, payablesCount, receivablesSum, receivablesCount, missingFx } = useMemo(() => {
    if (isTotal) {
      const rates = fxQ.data
      let pSum = new Decimal(0)
      let rSum = new Decimal(0)
      let pCount = 0
      let rCount = 0
      const missing = new Set<string>()
      FIAT_CURRENCIES.forEach((c, i) => {
        const pData = flowQs[i * 2]?.data as
          | { total_remaining: string; count: number }
          | undefined
        const rData = flowQs[i * 2 + 1]?.data as
          | { total_remaining: string; count: number }
          | undefined
        if (pData) {
          pCount += pData.count
          const conv = convertToTarget(new Decimal(pData.total_remaining), c, CONVERT_TO, rates)
          if (conv != null) pSum = pSum.plus(conv)
          else if (parseFloat(pData.total_remaining) > 0) missing.add(c)
        }
        if (rData) {
          rCount += rData.count
          const conv = convertToTarget(new Decimal(rData.total_remaining), c, CONVERT_TO, rates)
          if (conv != null) rSum = rSum.plus(conv)
          else if (parseFloat(rData.total_remaining) > 0) missing.add(c)
        }
      })
      return {
        payablesSum: pSum.toFixed(2),
        payablesCount: pCount,
        receivablesSum: rSum.toFixed(2),
        receivablesCount: rCount,
        missingFx: Array.from(missing),
      }
    }
    const pData = flowQs[0]?.data as
      | { total_remaining: string; count: number }
      | undefined
    const rData = flowQs[1]?.data as
      | { total_remaining: string; count: number }
      | undefined
    return {
      payablesSum: pData?.total_remaining ?? '0',
      payablesCount: pData?.count ?? 0,
      receivablesSum: rData?.total_remaining ?? '0',
      receivablesCount: rData?.count ?? 0,
      missingFx: [] as string[],
    }
  }, [flowQs, fxQ.data, isTotal])

  const cashflowChart = useMemo(() => {
    const buckets = cashflow6moQ.data?.buckets ?? []
    return buckets.map((b: any) => ({
      period: formatBucketLabel(b.period, 'month'),
      Receitas: parseFloat(b.income),
      Despesas: parseFloat(b.expense),
    }))
  }, [cashflow6moQ.data])

  const expensePie = useMemo(() => {
    const nodes = byCategoryQ.data?.nodes ?? []
    const sorted = [...nodes].sort(
      (a, b) => parseFloat(b.subtree_total) - parseFloat(a.subtree_total)
    )
    const top = sorted.slice(0, TOP_N)
    const rest = sorted.slice(TOP_N)
    const out = top.map((n, i) => ({
      name: n.name,
      value: parseFloat(n.subtree_total),
      color: n.color || CHART_PALETTE[i % CHART_PALETTE.length],
    }))
    if (rest.length > 0) {
      const sum = rest.reduce((acc, n) => acc + parseFloat(n.subtree_total), 0)
      if (sum > 0) {
        out.push({
          name: 'Outros',
          value: sum,
          color: CHART_PALETTE[CHART_PALETTE.length - 1],
        })
      }
    }
    return out.filter((d) => d.value > 0)
  }, [byCategoryQ.data])

  const monthBalance = useMemo(() => {
    if (incomeMonth == null || expensesMonth == null) return null
    return parseFloat(incomeMonth) - parseFloat(expensesMonth)
  }, [incomeMonth, expensesMonth])

  return (
    <div className="relative space-y-8 animate-fade-in">
      {/* Ambient glow background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 left-1/4 h-72 w-72 bg-glow-cyan opacity-30"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 right-10 h-64 w-64 bg-glow-emerald opacity-20"
      />

      {/* Header */}
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
            <span>
              {new Date().toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {greeting()}
            {user?.name ? (
              <>
                ,{' '}
                <span className="bg-gradient-to-br from-primary to-success bg-clip-text text-transparent">
                  {user.name.split(' ')[0]}
                </span>
              </>
            ) : ''}.
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão geral em{' '}
            <span className="font-mono font-medium text-foreground">
              {isTotal ? `TOTAL ≈ ${CONVERT_TO}` : displayCurrency}
            </span>
            . Atualizado agora.
          </p>
        </div>
        <CurrencySelector value={selected} onChange={setSelected} includeTotal />
      </div>

      {errorQ && (
        <div
          className="relative rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          Falha ao carregar parte do dashboard. Recarregue a página.
        </div>
      )}

      {isTotal && missingFx.length > 0 && (
        <div
          className="relative flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-warning"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">FX desatualizado — totais aproximados indisponíveis</p>
            <p className="text-xs text-warning/80">
              Sem cotação atual para {missingFx.join(', ')}. Saldos dessas moedas foram excluídos do TOTAL.
            </p>
          </div>
        </div>
      )}

      {/* KPIs principais */}
      <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isTotal && netForCurrency == null ? (
          <KpiCard
            icon={Wallet}
            title="Saldo total"
            value="—"
            hint="Sem cotação FX disponível"
            loading={isLoading}
            tone="neutral"
            highlighted
          />
        ) : (
          <KpiCard
            icon={Wallet}
            title="Saldo total"
            value={netForCurrency != null ? formatCurrency(netForCurrency, displayCurrency) : '—'}
            hint="Contas menos cartões"
            loading={isLoading}
            tone={
              netForCurrency != null
                ? parseFloat(netForCurrency) >= 0
                  ? 'positive'
                  : 'negative'
                : 'neutral'
            }
            highlighted
          />
        )}
        <KpiCard
          icon={Coins}
          title="Despesas do mês"
          value={expensesMonth != null ? formatCurrency(expensesMonth, displayCurrency) : '—'}
          hint={
            monthBalance != null
              ? `Saldo do mês: ${formatCurrency(monthBalance, displayCurrency)}`
              : 'Período corrente'
          }
          trend={monthBalance != null ? (monthBalance >= 0 ? 'up' : 'down') : undefined}
          loading={isLoading}
          tone="negative"
        />
        <KpiCard
          icon={CreditCard}
          title="A pagar"
          value={formatCurrency(payablesSum, displayCurrency)}
          hint={`${payablesCount} aberto${payablesCount === 1 ? '' : 's'} · inclui vencidos e parciais`}
          loading={isLoading}
          tone="warning"
        />
        <KpiCard
          icon={PiggyBank}
          title="A receber"
          value={formatCurrency(receivablesSum, displayCurrency)}
          hint={`${receivablesCount} aberto${receivablesCount === 1 ? '' : 's'} · inclui vencidos`}
          loading={isLoading}
          tone="positive"
        />
      </div>

      {/* Phase C — Runway + Currency Exposure widgets */}
      <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RunwayWidget
          loading={runwayQ.isLoading}
          isError={runwayQ.isError}
          data={runwayQ.data}
          displayCurrency={displayCurrency}
        />
        <CurrencyExposureWidget
          loading={currencyExposureQ.isLoading}
          isError={currencyExposureQ.isError}
          data={currencyExposureQ.data}
        />
      </div>

      {/* Upcoming payables — actionable, surfaced near the top */}
      <div className="relative">
        <UpcomingPayablesWidget />
      </div>

      {/* Charts */}
      <div className="relative grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card shadow-soft lg:col-span-2">
          <div className="flex items-start justify-between border-b border-border/40 p-5">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                Cashflow
              </div>
              <h3 className="mt-1 text-[15px] font-semibold tracking-tight">
                Fluxo de caixa · 6 meses
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <LegendDot color="var(--color-success)" label="Receitas" />
              <LegendDot color="var(--color-destructive)" label="Despesas" />
            </div>
          </div>
          <div className="p-3 sm:p-5">
            {cashflow6moQ.isLoading ? (
              <ChartSkeleton />
            ) : cashflow6moQ.isError ? (
              <ChartError msg="Falha ao carregar fluxo de caixa." />
            ) : cashflowChart.length === 0 ? (
              <ChartEmpty msg="Sem dados no período." />
            ) : (
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={cashflowChart}
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
                      width={42}
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
                          ? formatCurrency(v, displayCurrency)
                          : ''
                      }
                    />
                    <Bar
                      dataKey="Receitas"
                      fill="var(--color-success)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={42}
                    />
                    <Bar
                      dataKey="Despesas"
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

        <div className="rounded-xl border border-border/60 bg-card shadow-soft">
          <div className="border-b border-border/40 p-5">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Allocation
            </div>
            <h3 className="mt-1 text-[15px] font-semibold tracking-tight">
              Despesas por categoria
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Mês corrente · top {TOP_N}</p>
          </div>
          <div className="p-5">
            {byCategoryQ.isLoading ? (
              <ChartSkeleton />
            ) : byCategoryQ.isError ? (
              <ChartError msg="Falha ao carregar categorias." />
            ) : expensePie.length === 0 ? (
              <ChartEmpty msg="Sem despesas no período." />
            ) : (
              <div className="space-y-4">
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expensePie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={88}
                        innerRadius={56}
                        paddingAngle={2}
                        stroke="var(--color-card)"
                        strokeWidth={2}
                      >
                        {expensePie.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--color-popover)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                          fontSize: 12,
                          fontFamily: 'var(--font-mono)',
                          boxShadow: 'var(--shadow-pop)',
                        }}
                        formatter={(v) =>
                          typeof v === 'number' || typeof v === 'string'
                            ? formatCurrency(v, displayCurrency)
                            : ''
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  {expensePie.slice(0, 6).map((d) => (
                    <li key={d.name} className="flex items-center gap-2 truncate">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: d.color,
                          boxShadow: `0 0 8px ${d.color}`,
                        }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-muted-foreground">{d.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="relative">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Acessos rápidos
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickAction
            to="/reports"
            icon={BarChart3}
            title="Relatórios"
            description="Cashflow, categorias, patrimônio"
          />
          <QuickAction
            to="/transactions"
            icon={ArrowLeftRightCustom}
            title="Lançamentos"
            description="Histórico de movimentações"
          />
          <QuickAction
            to="/payables"
            icon={CreditCard}
            title="Contas a pagar"
            description="Compromissos do mês"
          />
        </div>
      </div>
    </div>
  )
}

// inline icon to avoid extra import
function ArrowLeftRightCustom({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </svg>
  )
}

type Tone = 'positive' | 'negative' | 'neutral' | 'warning'

function KpiCard({
  icon: Icon,
  title,
  value,
  hint,
  loading,
  tone = 'neutral',
  trend,
  highlighted,
}: {
  icon: typeof Wallet
  title: string
  value: string
  hint: string
  loading: boolean
  tone?: Tone
  trend?: 'up' | 'down'
  highlighted?: boolean
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-success'
      : tone === 'negative'
        ? 'text-destructive'
        : tone === 'warning'
          ? 'text-warning'
          : 'text-foreground'

  const iconBg =
    tone === 'positive'
      ? 'bg-success/15 text-success ring-success/30 shadow-[0_0_16px_-4px_var(--color-success)]'
      : tone === 'negative'
        ? 'bg-destructive/15 text-destructive ring-destructive/30 shadow-[0_0_16px_-4px_var(--color-destructive)]'
        : tone === 'warning'
          ? 'bg-warning/15 text-warning ring-warning/30 shadow-[0_0_16px_-4px_var(--color-warning)]'
          : 'bg-primary/15 text-primary ring-primary/30 shadow-[0_0_16px_-4px_var(--color-primary)]'

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-card shadow-soft transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-elevated',
        highlighted
          ? 'border-primary/30 hover:border-primary/50'
          : 'border-border/60 hover:border-border'
      )}
    >
      {/* Subtle glow on highlighted */}
      {highlighted && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 bg-glow-cyan opacity-30 transition-opacity group-hover:opacity-50"
        />
      )}

      <div className="relative space-y-3 p-5">
        <div className="flex items-start justify-between">
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {title}
          </span>
          <div
            className={cn(
              'grid h-8 w-8 place-items-center rounded-lg ring-1 transition-shadow',
              iconBg
            )}
            aria-hidden="true"
          >
            <Icon className="h-4 w-4" strokeWidth={2.25} />
          </div>
        </div>
        {loading ? (
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
        ) : (
          <p
            className={cn(
              'font-mono text-2xl font-semibold tracking-tight tabular-nums',
              valueClass
            )}
          >
            {value}
          </p>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {trend === 'up' && <ArrowUpRight className="h-3.5 w-3.5 text-success" />}
          {trend === 'down' && <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />}
          <span className="truncate">{hint}</span>
        </div>
      </div>
    </div>
  )
}

function QuickAction({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  title: string
  description: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border/60 bg-card p-4 shadow-soft',
        'transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated'
      )}
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 transition-all group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary group-hover:shadow-[0_0_20px_-4px_var(--color-primary)]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-semibold tracking-tight">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  )
}

function ChartSkeleton() {
  return <div className="h-[280px] w-full animate-pulse rounded-lg bg-muted/60" />
}

function ChartEmpty({ msg }: { msg: string }) {
  return (
    <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/30 text-center">
      <TrendingUp className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  )
}

function ChartError({ msg }: { msg: string }) {
  return (
    <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 text-center text-sm text-destructive">
      <TrendingDown className="h-6 w-6" aria-hidden="true" />
      <p>{msg}</p>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-muted-foreground">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

const RUNWAY_STATUS_META: Record<RunwayStatus, { label: string; tone: 'positive' | 'warning' | 'destructive' | 'neutral' }> = {
  healthy: { label: 'Saudável', tone: 'positive' },
  warning: { label: 'Atenção', tone: 'warning' },
  critical: { label: 'Crítico', tone: 'destructive' },
  unknown: { label: 'Sem dados', tone: 'neutral' },
}

function RunwayWidget({
  loading,
  isError,
  data,
  displayCurrency,
}: {
  loading: boolean
  isError: boolean
  data?: import('@/lib/api/reports').RunwayReport
  displayCurrency: string
}) {
  const status: RunwayStatus = data?.status ?? 'unknown'
  const meta = RUNWAY_STATUS_META[status]
  const toneClass =
    meta.tone === 'positive'
      ? 'text-success'
      : meta.tone === 'warning'
        ? 'text-warning'
        : meta.tone === 'destructive'
          ? 'text-destructive'
          : 'text-muted-foreground'
  const dotClass =
    meta.tone === 'positive'
      ? 'bg-success'
      : meta.tone === 'warning'
        ? 'bg-warning'
        : meta.tone === 'destructive'
          ? 'bg-destructive'
          : 'bg-muted-foreground'

  const months3m = data?.runway_months_3m
  const months6m = data?.runway_months_6m
  const months12m = data?.runway_months_12m
  const target = data?.target_months ?? 6
  // Pessimista para visualização da barra
  const monthsForBar = months3m != null ? parseFloat(months3m) : null
  const pct =
    monthsForBar != null
      ? Math.min(100, Math.max(0, (monthsForBar / (target * 2)) * 100))
      : 0

  return (
    <Link
      to="/reports#runway"
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/60 bg-card p-5 shadow-soft',
        'transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Gauge className="h-3 w-3 text-primary" strokeWidth={2.25} aria-hidden="true" />
            <span>Runway · {displayCurrency}</span>
          </div>
          <h3 className="text-[15px] font-semibold tracking-tight">Quantos meses duro?</h3>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
        ) : isError ? (
          <p className="text-sm text-destructive">Falha ao carregar.</p>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className={cn('font-mono text-3xl font-semibold tabular-nums', toneClass)}>
                {months3m != null ? `${parseFloat(months3m).toFixed(1)}` : '—'}
              </span>
              <span className="text-xs text-muted-foreground">meses (burn 3m)</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', dotClass)} aria-hidden="true" />
              <span className={cn('font-mono text-[11px] uppercase tracking-widest', toneClass)}>
                {meta.label}
              </span>
              <span className="text-[11px] text-muted-foreground">· meta {target}m</span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full transition-all', dotClass)}
                style={{ width: `${pct}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>6m: {months6m != null ? parseFloat(months6m).toFixed(1) : '—'}</span>
              <span>12m: {months12m != null ? parseFloat(months12m).toFixed(1) : '—'}</span>
            </div>
          </>
        )}
      </div>
    </Link>
  )
}

function CurrencyExposureWidget({
  loading,
  isError,
  data,
}: {
  loading: boolean
  isError: boolean
  data?: import('@/lib/api/reports').CurrencyExposureReport
}) {
  const slices = useMemo(() => {
    const items = data?.items ?? []
    return items
      .filter((it) => it.converted != null && parseFloat(it.converted!) > 0)
      .map((it, i) => ({
        name: it.currency,
        value: parseFloat(it.converted!),
        pct: it.pct != null ? parseFloat(it.pct) : 0,
        color: CHART_PALETTE[i % CHART_PALETTE.length],
      }))
      .sort((a, b) => b.value - a.value)
  }, [data])

  const top3 = slices.slice(0, 3)

  return (
    <Link
      to="/reports#currency-exposure"
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/60 bg-card p-5 shadow-soft',
        'transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevated'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Globe2 className="h-3 w-3 text-primary" strokeWidth={2.25} aria-hidden="true" />
            <span>Exposição por moeda · ≈ USD</span>
          </div>
          <h3 className="text-[15px] font-semibold tracking-tight">Diversificação cambial</h3>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="h-[110px] w-[110px] shrink-0">
          {loading ? (
            <div className="h-full w-full animate-pulse rounded-full bg-muted" />
          ) : isError || slices.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center rounded-full border border-dashed border-border/60 text-[10px] text-muted-foreground">
              —
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={52}
                  innerRadius={34}
                  paddingAngle={2}
                  stroke="var(--color-card)"
                  strokeWidth={1.5}
                >
                  {slices.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-popover)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    boxShadow: 'var(--shadow-pop)',
                  }}
                  formatter={(v, _name, entry) => {
                    const val = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
                    const pct =
                      (entry?.payload as { pct?: number } | undefined)?.pct ?? 0
                    return [`≈ ${formatCurrency(val, 'USD')} (${(pct * 100).toFixed(1)}%)`, '']
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <ul className="flex-1 space-y-1.5">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="h-3 w-full animate-pulse rounded bg-muted" />
              ))
            : top3.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color, boxShadow: `0 0 6px ${s.color}` }}
                      aria-hidden="true"
                    />
                    <span className="font-mono font-medium">{s.name}</span>
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {(s.pct * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
        </ul>
      </div>
    </Link>
  )
}
