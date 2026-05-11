import { useQuery } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import { reportsApi, type AgingBucketKey } from '@/lib/api/reports'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import type { SupportedCurrency } from './shared'

type Kind = 'payables' | 'receivables'

type Props = {
  currency: SupportedCurrency
  kind: Kind
}

const BUCKET_ORDER: AgingBucketKey[] = ['overdue', 'due_today', '1_7', '8_14', '15_30', '30_plus']

const BUCKET_LABEL: Record<AgingBucketKey, string> = {
  overdue: 'Vencido',
  due_today: 'Hoje',
  '1_7': '1-7d',
  '8_14': '8-14d',
  '15_30': '15-30d',
  '30_plus': '30+d',
}

// Color-coded: overdue vermelho → 30+ verde (gradação)
const BUCKET_COLOR: Record<AgingBucketKey, string> = {
  overdue: 'bg-destructive',
  due_today: 'bg-warning',
  '1_7': 'bg-warning/70',
  '8_14': 'bg-primary/70',
  '15_30': 'bg-success/70',
  '30_plus': 'bg-success',
}

export function AgingReport({ currency, kind }: Props) {
  const query = useQuery({
    queryKey: ['reports', kind === 'payables' ? 'payables-aging' : 'receivables-aging', { currency }],
    queryFn: () =>
      kind === 'payables'
        ? reportsApi.payablesAging({ currency_code: currency })
        : reportsApi.receivablesAging({ currency_code: currency }),
    staleTime: 5 * 60_000,
  })

  const data = query.data
  const max = data
    ? Math.max(
        ...BUCKET_ORDER.map((k) => parseFloat(data.buckets[k]?.total_remaining ?? '0')),
        1
      )
    : 1

  const id = kind === 'payables' ? 'payables-aging' : 'receivables-aging'
  const title = kind === 'payables' ? 'Aging de Payables' : 'Aging de Receivables'
  const subtitle = kind === 'payables' ? 'A pagar por janela' : 'A receber por janela'

  return (
    <div id={id} className="rounded-xl border border-border/60 bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Clock className="h-3 w-3 text-primary" strokeWidth={2.25} aria-hidden="true" />
            <span>{title}</span>
          </div>
          <h3 className="mt-1 text-[14px] font-semibold tracking-tight">
            {subtitle} · {currency}
          </h3>
        </div>
        {data && (
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Total
            </p>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {formatCurrency(data.grand_total_remaining, currency)}
            </p>
            <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {data.grand_count} item{data.grand_count === 1 ? '' : 's'}
            </p>
          </div>
        )}
      </div>

      {query.isLoading ? (
        <div className="h-[240px] w-full animate-pulse rounded-lg bg-muted/60" />
      ) : query.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          Falha ao carregar.
        </div>
      ) : !data || data.grand_count === 0 ? (
        <EmptyState msg="Sem itens em aberto." />
      ) : (
        <div className="space-y-2">
          {BUCKET_ORDER.map((k) => {
            const bucket = data.buckets[k]
            const value = parseFloat(bucket?.total_remaining ?? '0')
            const pct = (value / max) * 100
            return (
              <Row key={k} label={BUCKET_LABEL[k]} colorClass={BUCKET_COLOR[k]} pct={pct} value={value} count={bucket?.count ?? 0} currency={currency} />
            )
          })}
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  colorClass,
  pct,
  value,
  count,
  currency,
}: {
  label: string
  colorClass: string
  pct: number
  value: number
  count: number
  currency: SupportedCurrency
}) {
  return (
    <div className="grid grid-cols-[60px_1fr_auto] items-center gap-3 text-xs">
      <span className="font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="h-6 w-full overflow-hidden rounded bg-muted/40">
        <div
          className={cn('h-full rounded transition-all', colorClass)}
          style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
          aria-hidden="true"
        />
      </div>
      <span className="font-mono tabular-nums">
        {formatCurrency(value, currency)}
        <span className="ml-2 text-muted-foreground">({count})</span>
      </span>
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
