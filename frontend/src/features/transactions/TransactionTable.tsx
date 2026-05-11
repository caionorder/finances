import { useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { accountsApi } from '@/lib/api/accounts'
import { categoriesApi } from '@/lib/api/categories'
import {
  transactionsApi,
  type TransactionFilters,
  type TransactionOut,
} from '@/lib/api/transactions'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { DeleteTransactionDialog } from './DeleteTransactionDialog'

type Props = {
  filters: TransactionFilters
  onEdit: (tx: TransactionOut) => void
}

const headCellClass =
  'h-10 bg-muted/40 px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground'

export function TransactionTable({ filters, onEdit }: Props) {
  const [deleteTarget, setDeleteTarget] = useState<TransactionOut | null>(null)

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: true }],
    queryFn: () => accountsApi.list(true),
  })

  const categoriesQuery = useQuery({
    queryKey: ['categories', 'list-all'],
    queryFn: () => categoriesApi.list(),
  })

  const accountMap = useMemo(() => {
    const m = new Map<number, { name: string; currency: string }>()
    for (const a of accountsQuery.data ?? []) {
      m.set(a.id, { name: a.name, currency: a.currency_code })
    }
    return m
  }, [accountsQuery.data])

  const categoryMap = useMemo(() => {
    const m = new Map<number, { name: string; color: string | null }>()
    for (const c of categoriesQuery.data ?? []) {
      m.set(c.id, { name: c.name, color: c.color })
    }
    return m
  }, [categoriesQuery.data])

  const txQuery = useInfiniteQuery({
    queryKey: ['transactions', filters],
    queryFn: ({ pageParam }) =>
      transactionsApi.list({ ...filters, cursor: pageParam, limit: 50 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  })

  const items = useMemo(() => {
    if (!txQuery.data) return []
    return txQuery.data.pages.flatMap((p) => p.items)
  }, [txQuery.data])

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/60 hover:bg-transparent">
              <TableHead className={`${headCellClass} w-[110px]`}>Data</TableHead>
              <TableHead className={headCellClass}>Descrição</TableHead>
              <TableHead className={headCellClass}>Categoria</TableHead>
              <TableHead className={headCellClass}>Conta</TableHead>
              <TableHead className={`${headCellClass} text-right`}>Valor</TableHead>
              <TableHead className={`${headCellClass} w-[60px] text-right`}>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {txQuery.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="border-b border-border/40">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j} className="py-3">
                      <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : txQuery.isError ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-destructive">
                  Falha ao carregar transações.
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Nenhuma transação encontrada.
                </TableCell>
              </TableRow>
            ) : (
              items.map((tx) => {
                const acc = accountMap.get(tx.account_id)
                const cat = tx.category_id ? categoryMap.get(tx.category_id) : null
                const amountNum = parseFloat(tx.amount)
                const isNegative = !Number.isNaN(amountNum) && amountNum < 0
                const isTransfer = tx.kind === 'transfer'
                return (
                  <TableRow
                    key={tx.id}
                    className="border-b border-border/40 transition-colors hover:bg-accent/30"
                  >
                    <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDate(tx.date)}
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <div className="flex items-center gap-2">
                        {isTransfer ? (
                          <span
                            className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30"
                            aria-label="Transferência"
                          >
                            <ArrowLeftRight className="h-3 w-3" />
                          </span>
                        ) : null}
                        <DescriptionCell text={tx.description} />
                      </div>
                    </TableCell>
                    <TableCell>
                      {cat ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md border bg-card/40 px-1.5 py-0.5 text-[11px] font-medium"
                          style={
                            cat.color
                              ? {
                                  borderColor: `${cat.color}66`,
                                  color: cat.color,
                                }
                              : undefined
                          }
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{
                              backgroundColor: cat.color ?? 'currentColor',
                              boxShadow: cat.color
                                ? `0 0 6px ${cat.color}`
                                : undefined,
                            }}
                          />
                          {cat.name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                          Sem categoria
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{acc?.name ?? '—'}</span>
                        <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {tx.currency_code}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono text-sm font-medium tabular-nums',
                        isNegative ? 'text-destructive' : 'text-success'
                      )}
                    >
                      {formatCurrency(tx.amount, tx.currency_code)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Ações"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!isTransfer ? (
                            <DropdownMenuItem onSelect={() => onEdit(tx)}>
                              Editar
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setDeleteTarget(tx)}
                          >
                            {isTransfer ? 'Excluir transferência' : 'Excluir'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {txQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => txQuery.fetchNextPage()}
            disabled={txQuery.isFetchingNextPage}
          >
            {txQuery.isFetchingNextPage ? 'Carregando...' : 'Carregar mais'}
          </Button>
        </div>
      ) : null}

      <DeleteTransactionDialog
        transaction={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function DescriptionCell({ text }: { text: string | null }) {
  const value = text ?? '—'
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block max-w-[300px] truncate text-sm">{value}</span>
        </TooltipTrigger>
        {text && text.length > 40 ? (
          <TooltipContent className="max-w-sm">{text}</TooltipContent>
        ) : null}
      </Tooltip>
    </TooltipProvider>
  )
}

function formatDate(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}
