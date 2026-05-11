import { useQuery } from '@tanstack/react-query'
import { TrendingDown, TrendingUp, Sparkles, ListOrdered } from 'lucide-react'
import { reportsApi } from '@/lib/api/reports'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { SupportedCurrency } from './shared'

type Props = {
  currency: SupportedCurrency
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function TopCategoriesReport({ currency }: Props) {
  const month = currentMonth()
  const query = useQuery({
    queryKey: ['reports', 'top-categories', { currency, month }],
    queryFn: () => reportsApi.topCategories({ currency_code: currency, month, top_n: 10 }),
    staleTime: 5 * 60_000,
  })

  const items = query.data?.items ?? []

  return (
    <div id="top-categories" className="rounded-xl border border-border/60 bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <ListOrdered className="h-3 w-3 text-primary" strokeWidth={2.25} aria-hidden="true" />
            <span>Top Categorias · MoM</span>
          </div>
          <h3 className="mt-1 text-[14px] font-semibold tracking-tight">
            {query.data ? `${formatMonth(query.data.month)} vs ${formatMonth(query.data.prev_month)}` : '—'}
            {' · '}{currency}
          </h3>
        </div>
      </div>

      {query.isLoading ? (
        <div className="h-[240px] w-full animate-pulse rounded-lg bg-muted/60" />
      ) : query.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          Falha ao carregar.
        </div>
      ) : items.length === 0 ? (
        <EmptyState msg="Sem despesa no mês." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/40">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="border-b border-border/60 hover:bg-transparent">
                <TableHead className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Categoria
                </TableHead>
                <TableHead className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Atual
                </TableHead>
                <TableHead className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Anterior
                </TableHead>
                <TableHead className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Δ
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const deltaPct = it.delta_pct != null ? parseFloat(it.delta_pct) : null
                return (
                  <TableRow
                    key={it.category_id ?? 'uncategorized'}
                    className="border-b border-border/40 hover:bg-accent/30"
                  >
                    <TableCell className="px-3 py-2 text-sm">
                      <span className="truncate">{it.name}</span>
                      {it.is_new && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                          <Sparkles className="h-2.5 w-2.5" />
                          new
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-mono text-sm tabular-nums">
                      {formatCurrency(it.current, currency)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(it.previous, currency)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right">
                      {it.is_new ? (
                        <span className="font-mono text-xs text-primary">novo</span>
                      ) : deltaPct == null ? (
                        <span className="font-mono text-xs text-muted-foreground">—</span>
                      ) : (
                        <DeltaChip pct={deltaPct} />
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function DeltaChip({ pct }: { pct: number }) {
  const positive = pct < 0 // queda de gasto é positiva
  const Icon = positive ? TrendingDown : TrendingUp
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums',
        positive ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'
      )}
    >
      <Icon className="h-3 w-3" />
      {pct > 0 ? '+' : ''}{(pct * 100).toFixed(1)}%
    </span>
  )
}

function formatMonth(period: string): string {
  const [y, m] = period.split('-')
  if (!y || !m) return period
  const monthsPt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${monthsPt[parseInt(m, 10) - 1] ?? m}/${y.slice(2)}`
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/30 py-10 text-xs text-muted-foreground">
      {msg}
    </div>
  )
}
