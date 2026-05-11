import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Download,
  ListTree,
  PieChart as PieChartIcon,
} from 'lucide-react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  reportsApi,
  type ByCategoryReport as ByCategoryReportData,
  type CategoryNode,
} from '@/lib/api/reports'
import { formatCurrency } from '@/lib/currency'
import { downloadCsv } from '@/lib/csv'
import { DateRangeFilter } from './DateRangeFilter'
import {
  CHART_PALETTE,
  firstDayOfMonth,
  lastDayOfMonth,
  type SupportedCurrency,
} from './shared'

type Kind = 'expense' | 'income'

type Props = {
  currency: SupportedCurrency
}

type FlatRow = {
  id: string
  depth: number
  name: string
  color: string
  own: number
  subtree: number
  hasChildren: boolean
}

const TOP_N = 8

export function ByCategoryReport({ currency }: Props) {
  const [from, setFrom] = useState<string>(() => firstDayOfMonth())
  const [to, setTo] = useState<string>(() => lastDayOfMonth())
  const [kind, setKind] = useState<Kind>('expense')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const query = useQuery({
    queryKey: ['reports', 'by-category', { currency, from, to, kind }],
    queryFn: () => reportsApi.byCategory({ currency, from, to, kind }),
    enabled: Boolean(from && to),
  })

  const data: ByCategoryReportData | undefined = query.data
  const nodes = data?.nodes ?? []

  const chartData = useMemo(() => {
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
  }, [nodes])

  const flatRows = useMemo<FlatRow[]>(() => {
    const out: FlatRow[] = []
    const walk = (n: CategoryNode, depth: number, parentKey: string, paletteIdx: number) => {
      const id = `${parentKey}/${n.category_id ?? n.name}`
      const color = n.color || CHART_PALETTE[paletteIdx % CHART_PALETTE.length]
      out.push({
        id,
        depth,
        name: n.name,
        color,
        own: parseFloat(n.own_total),
        subtree: parseFloat(n.subtree_total),
        hasChildren: n.children.length > 0,
      })
      if (expanded[id] && n.children.length > 0) {
        n.children.forEach((c, idx) => walk(c, depth + 1, id, paletteIdx + idx + 1))
      }
    }
    nodes.forEach((n, idx) => walk(n, 0, 'root', idx))
    return out
  }, [nodes, expanded])

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function handleExport() {
    if (!data) return
    const rows: { categoria: string; own_total: string; subtree_total: string }[] = []
    const walk = (n: CategoryNode, prefix: string) => {
      const label = `${prefix}${n.name}`
      rows.push({
        categoria: label,
        own_total: n.own_total,
        subtree_total: n.subtree_total,
      })
      n.children.forEach((c) => walk(c, `${prefix}— `))
    }
    nodes.forEach((n) => walk(n, ''))
    rows.push({
      categoria: 'TOTAL',
      own_total: data.total,
      subtree_total: data.total,
    })
    downloadCsv(
      rows,
      ['categoria', 'own_total', 'subtree_total'],
      `por-categoria_${kind}_${currency}_${from}_${to}.csv`
    )
  }

  const totalLabel = data ? formatCurrency(data.total, currency) : '—'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-soft">
        <DateRangeFilter
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
        />
        <div className="space-y-1">
          <span className="block font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Tipo
          </span>
          <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <TabsList>
              <TabsTrigger value="expense">Despesas</TabsTrigger>
              <TabsTrigger value="income">Receitas</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Button
          type="button"
          variant="outline"
          className="ml-auto h-9"
          onClick={handleExport}
          disabled={!data || nodes.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      <div className="rounded-xl border border-border/60 bg-card shadow-soft">
        <div className="border-b border-border/40 p-5">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <PieChartIcon className="h-3 w-3 text-primary" strokeWidth={2.25} />
            <span>Allocation</span>
          </div>
          <h3 className="mt-1 text-[15px] font-semibold tracking-tight">
            {kind === 'expense' ? 'Despesas' : 'Receitas'} por categoria · {currency}
          </h3>
        </div>
        <div className="p-5">
          {query.isLoading ? (
            <div className="h-[320px] w-full animate-pulse rounded-lg bg-muted/60" />
          ) : query.isError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              Falha ao carregar relatório.
            </div>
          ) : chartData.length === 0 ? (
            <EmptyState msg="Sem dados para o período selecionado." />
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(0,260px)]">
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      innerRadius={70}
                      paddingAngle={2}
                      stroke="var(--color-card)"
                      strokeWidth={2}
                    >
                      {chartData.map((entry, idx) => (
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
                          ? formatCurrency(v, currency)
                          : ''
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-2 self-center">
                {chartData.slice(0, 8).map((d) => (
                  <li key={d.name} className="flex items-center gap-2 truncate text-xs">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: d.color,
                        boxShadow: `0 0 8px ${d.color}`,
                      }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate text-muted-foreground">{d.name}</span>
                    <span className="font-mono tabular-nums text-foreground">
                      {formatCurrency(d.value, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
        <div className="flex items-start justify-between border-b border-border/40 p-5">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <ListTree className="h-3 w-3 text-primary" strokeWidth={2.25} />
              <span>Detalhamento</span>
            </div>
            <h3 className="mt-1 text-[15px] font-semibold tracking-tight">
              Árvore de categorias
            </h3>
          </div>
        </div>
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-b border-border/60 hover:bg-transparent">
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Categoria
              </TableHead>
              <TableHead className="px-4 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Própria
              </TableHead>
              <TableHead className="px-4 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Total (c/ sub)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flatRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                  {query.isLoading ? 'Carregando...' : 'Sem registros.'}
                </TableCell>
              </TableRow>
            ) : (
              flatRows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-b border-border/40 transition-colors hover:bg-accent/30"
                >
                  <TableCell className="px-4 py-3">
                    <div
                      className="flex items-center gap-2"
                      style={{ paddingLeft: `${row.depth * 18}px` }}
                    >
                      {row.hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggle(row.id)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          aria-label={expanded[row.id] ? 'Recolher' : 'Expandir'}
                        >
                          {expanded[row.id] ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : (
                        <span className="inline-block h-5 w-5" />
                      )}
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: row.color,
                          boxShadow: `0 0 6px ${row.color}`,
                        }}
                        aria-hidden="true"
                      />
                      <span className="text-sm">{row.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right font-mono text-sm tabular-nums text-muted-foreground">
                    {formatCurrency(row.own, currency)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right font-mono text-sm font-medium tabular-nums">
                    {formatCurrency(row.subtree, currency)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {data && nodes.length > 0 ? (
            <TableFooter className="bg-muted/40">
              <TableRow className="border-t border-border/60 hover:bg-transparent">
                <TableCell className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Total
                </TableCell>
                <TableCell />
                <TableCell className="px-4 py-3 text-right font-mono text-sm font-semibold tabular-nums">
                  {totalLabel}
                </TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>
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
