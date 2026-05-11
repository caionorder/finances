import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Globe2 } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { reportsApi } from '@/lib/api/reports'
import { formatCurrency } from '@/lib/currency'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CHART_PALETTE } from './shared'

const CONVERT_TO = 'USD'

export function CurrencyExposureReport() {
  const query = useQuery({
    queryKey: ['reports', 'currency-exposure', { convert_to: CONVERT_TO }],
    queryFn: () => reportsApi.currencyExposure({ convert_to: CONVERT_TO }),
    staleTime: 5 * 60_000,
  })

  const items = query.data?.items ?? []

  const slices = useMemo(
    () =>
      items
        .filter((it) => it.converted != null && parseFloat(it.converted!) > 0)
        .map((it, i) => ({
          name: it.currency,
          value: parseFloat(it.converted!),
          pct: it.pct != null ? parseFloat(it.pct) : 0,
          color: CHART_PALETTE[i % CHART_PALETTE.length],
          net: it.net,
        }))
        .sort((a, b) => b.value - a.value),
    [items]
  )

  const missingFx = items.filter((it) => it.converted == null)

  return (
    <div id="currency-exposure" className="rounded-xl border border-border/60 bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Globe2 className="h-3 w-3 text-primary" strokeWidth={2.25} aria-hidden="true" />
            <span>Currency Exposure</span>
          </div>
          <h3 className="mt-1 text-[14px] font-semibold tracking-tight">
            Diversificação cambial · ≈ {CONVERT_TO}
          </h3>
        </div>
        {query.data && (
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Total
            </p>
            <p className="font-mono text-sm font-semibold tabular-nums">
              ≈ {formatCurrency(query.data.total_converted, CONVERT_TO)}
            </p>
          </div>
        )}
      </div>

      {query.isLoading ? (
        <div className="h-[260px] w-full animate-pulse rounded-lg bg-muted/60" />
      ) : query.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          Falha ao carregar exposição cambial.
        </div>
      ) : slices.length === 0 ? (
        <EmptyState msg="Sem dados de patrimônio." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={55}
                  paddingAngle={2}
                  stroke="var(--color-card)"
                  strokeWidth={2}
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
                  }}
                  formatter={(v, _name, entry) => {
                    const val = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
                    const pct =
                      (entry?.payload as { pct?: number } | undefined)?.pct ?? 0
                    return [`${formatCurrency(val, CONVERT_TO)} (${(pct * 100).toFixed(1)}%)`, '']
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-hidden rounded-lg border border-border/40">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Moeda
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Saldo
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    ≈ {CONVERT_TO}
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    %
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, idx) => (
                  <TableRow key={it.currency} className="border-b border-border/40 hover:bg-accent/30">
                    <TableCell className="px-3 py-2 text-sm">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: CHART_PALETTE[idx % CHART_PALETTE.length],
                            boxShadow: `0 0 6px ${CHART_PALETTE[idx % CHART_PALETTE.length]}`,
                          }}
                          aria-hidden="true"
                        />
                        <span className="font-mono font-medium">{it.currency}</span>
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                      {formatCurrency(it.net, it.currency)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                      {it.converted == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        formatCurrency(it.converted, CONVERT_TO)
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                      {it.pct == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        `${(parseFloat(it.pct) * 100).toFixed(1)}%`
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {missingFx.length > 0 && (
        <p className="mt-3 font-mono text-[10px] text-warning">
          {missingFx.length} moeda{missingFx.length === 1 ? '' : 's'} sem cotação FX (ignorada{missingFx.length === 1 ? '' : 's'} no total):{' '}
          {missingFx.map((m) => m.currency).join(', ')}
        </p>
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
