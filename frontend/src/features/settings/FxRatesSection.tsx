import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Coins, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fxApi, type FxRateOut } from '@/lib/api/fx'
import { findCurrencyMeta } from '@/lib/api/currencies'
import { useAuth } from '@/features/auth/AuthContext'
import { cn } from '@/lib/utils'

function formatRelative(value: string): string {
  try {
    return `há ${formatDistanceToNow(new Date(value), { locale: ptBR })}`
  } catch {
    return value
  }
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)
      ?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}

function CodeBadge({ code }: { code: string }) {
  const meta = findCurrencyMeta(code)
  const isCrypto = meta?.is_crypto ?? false
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
        isCrypto
          ? 'border-warning/30 bg-warning/10 text-warning'
          : 'border-primary/30 bg-primary/10 text-primary'
      )}
    >
      {code}
    </span>
  )
}

export function FxRatesSection() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const ratesQuery = useQuery({
    queryKey: ['fx-rates'],
    queryFn: () => fxApi.list(),
  })

  const refreshMutation = useMutation({
    mutationFn: () => fxApi.refresh(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fx-rates'] })
      if (data.error) {
        toast.warning(
          `Atualização parcial: ${data.persisted}/${data.fetched} pares. ${data.error}`
        )
      } else {
        toast.success(`${data.persisted} cotações atualizadas`)
      }
    },
    onError: (err) => {
      toast.error(extractError(err, 'Falha ao atualizar cotações.'))
    },
  })

  const sortedRates = useMemo(() => {
    if (!ratesQuery.data) return []
    return [...ratesQuery.data].sort((a, b) => {
      const aKey = `${a.base_code}/${a.quote_code}`
      const bKey = `${b.base_code}/${b.quote_code}`
      return aKey.localeCompare(bKey)
    })
  }, [ratesQuery.data])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Coins className="h-3 w-3 text-primary" strokeWidth={2.25} />
            <span>FX Rates</span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Cotações</h2>
          <p className="text-sm text-muted-foreground">
            Taxas usadas pra converter saldos entre moedas (fiat e cripto). A
            atualização busca cotações de fontes externas e persiste a última
            leitura.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="h-9 transition-shadow hover:shadow-[0_0_24px_-6px_var(--color-primary)]"
          >
            <RefreshCw
              className={cn(
                'mr-2 h-4 w-4',
                refreshMutation.isPending && 'animate-spin'
              )}
            />
            {refreshMutation.isPending ? 'Atualizando...' : 'Atualizar'}
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-b border-border/60 hover:bg-transparent">
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Par
              </TableHead>
              <TableHead className="px-4 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Cotação
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Fonte
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Atualizada
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ratesQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="border-b border-border/40">
                  {Array.from({ length: 4 }).map((__, j) => (
                    <TableCell key={j} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded-md bg-muted/60" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : ratesQuery.isError ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-10 text-center text-sm text-destructive"
                >
                  Falha ao carregar cotações.
                </TableCell>
              </TableRow>
            ) : sortedRates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12">
                  <EmptyState isAdmin={isAdmin} />
                </TableCell>
              </TableRow>
            ) : (
              sortedRates.map((rate) => (
                <FxRateRow key={`${rate.base_code}-${rate.quote_code}`} rate={rate} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function FxRateRow({ rate }: { rate: FxRateOut }) {
  const rateNum = parseFloat(rate.rate)
  const display = Number.isNaN(rateNum)
    ? rate.rate
    : new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8,
      }).format(rateNum)

  return (
    <TableRow className="border-b border-border/40 transition-colors hover:bg-accent/30">
      <TableCell className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <CodeBadge code={rate.base_code} />
          <span className="font-mono text-xs text-muted-foreground">→</span>
          <CodeBadge code={rate.quote_code} />
        </div>
      </TableCell>
      <TableCell className="px-4 py-3 text-right font-mono text-sm tabular-nums">
        {display}
      </TableCell>
      <TableCell className="px-4 py-3">
        <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {rate.source}
        </span>
      </TableCell>
      <TableCell className="px-4 py-3 text-xs text-muted-foreground">
        {formatRelative(rate.fetched_at)}
      </TableCell>
    </TableRow>
  )
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
        <Coins className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Nenhuma cotação ainda</p>
        <p className="text-xs text-muted-foreground">
          {isAdmin
            ? 'Clique em Atualizar para buscar as cotações atuais.'
            : 'Aguarde um administrador atualizar as cotações.'}
        </p>
      </div>
    </div>
  )
}
