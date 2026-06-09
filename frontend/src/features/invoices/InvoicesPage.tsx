import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import {
  FileText,
  Inbox,
  MoreHorizontal,
  Plus,
  Receipt,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RoleGate } from '@/features/auth/RoleGate'
import {
  invoicesApi,
  type InvoiceOut,
  type InvoiceStatusFilter,
} from '@/lib/api/invoices'
import { customersApi, type CustomerOut } from '@/lib/api/customers'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { InvoiceStatusBadge } from './status'
import { resolveVisualStatus } from './statusMeta'
import { formatDateBR } from './utils'

const ALL = '__all__'

const STATUS_TABS: { value: InvoiceStatusFilter | typeof ALL; label: string }[] =
  [
    { value: ALL, label: 'Todas' },
    { value: 'draft', label: 'Rascunhos' },
    { value: 'issued', label: 'Emitidas' },
    { value: 'sent', label: 'Enviadas' },
    { value: 'overdue', label: 'Vencidas' },
    { value: 'paid', label: 'Pagas' },
    { value: 'void', label: 'Anuladas' },
  ]

const BUCKET_LABELS: Record<string, string> = {
  current: 'Em dia',
  due_soon: 'A vencer',
  overdue: 'Vencidas',
  d1_30: '1–30 dias',
  d31_60: '31–60 dias',
  d61_90: '61–90 dias',
  d90_plus: '90+ dias',
}

export function InvoicesPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<InvoiceStatusFilter | typeof ALL>(ALL)
  const [search, setSearch] = useState('')
  const [customerId, setCustomerId] = useState<string>(ALL)

  const summaryQuery = useQuery({
    queryKey: ['invoices', 'outstanding-summary'],
    queryFn: () => invoicesApi.outstandingSummary(),
  })

  const customersQuery = useQuery({
    queryKey: ['customers', 'list-all'],
    queryFn: () => customersApi.list({ include_archived: true, limit: 200 }),
  })

  const customerMap = useMemo(() => {
    const m = new Map<number, CustomerOut>()
    for (const c of customersQuery.data?.items ?? []) m.set(c.id, c)
    return m
  }, [customersQuery.data])

  const listQuery = useInfiniteQuery({
    queryKey: [
      'invoices',
      'list',
      {
        status: status === ALL ? null : status,
        search: search || null,
        customer: customerId === ALL ? null : customerId,
      },
    ],
    queryFn: ({ pageParam }) =>
      invoicesApi.list({
        status: status === ALL ? undefined : status,
        search: search || undefined,
        customer_id: customerId === ALL ? undefined : Number(customerId),
        cursor: pageParam,
        limit: 25,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  })

  const invoices = useMemo(
    () => listQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [listQuery.data]
  )

  const summary = summaryQuery.data

  return (
    <div className="relative space-y-8 animate-fade-in">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 right-16 h-56 w-56 bg-glow-cyan opacity-25"
      />

      {/* Header */}
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Receipt className="h-3 w-3 text-primary" aria-hidden="true" />
            <span>Comercial · USD</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Invoices
          </h1>
          <p className="text-sm text-muted-foreground">
            Emita faturas comerciais aos clientes dos EUA e acompanhe os wires.
          </p>
        </div>
        <RoleGate roles={['admin', 'member']}>
          <Button
            onClick={() => navigate('/invoices/new')}
            className="shadow-[0_0_24px_-8px_var(--color-primary)]"
          >
            <Plus className="mr-2 h-4 w-4" strokeWidth={2.25} />
            Nova invoice
          </Button>
        </RoleGate>
      </div>

      {/* Outstanding stat band */}
      <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <StatCard
          label="Em aberto"
          value={
            summary
              ? formatCurrency(summary.total, summary.currency_code)
              : '—'
          }
          hint={summary ? `${summary.count} invoice(s)` : ''}
          accent="primary"
          loading={summaryQuery.isLoading}
          wide
        />
        {summary
          ? Object.entries(summary.by_bucket).map(([key, bucket]) => (
              <StatCard
                key={key}
                label={BUCKET_LABELS[key] ?? key}
                value={formatCurrency(bucket.total, summary.currency_code)}
                hint={`${bucket.count} invoice(s)`}
                accent={key.includes('overdue') ? 'destructive' : 'muted'}
                loading={false}
              />
            ))
          : null}
      </div>

      {/* Filters */}
      <div className="relative space-y-3">
        <div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b border-border/60 pb-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatus(tab.value)}
              className={cn(
                'relative whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                status === tab.value
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card p-3 shadow-soft">
          <div className="relative min-w-[220px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por número, cliente, PO..."
              className="h-9 border-border/80 bg-background/50 pl-9 text-sm"
            />
          </div>
          <div className="h-6 w-px bg-border/60" aria-hidden="true" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Cliente
            </span>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="h-9 w-[220px] border-border/80 bg-background/50 text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os clientes</SelectItem>
                {(customersQuery.data?.items ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.legal_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">
                Número
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">
                Cliente
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">
                Emissão
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">
                Vencimento
              </TableHead>
              <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">
                Total
              </TableHead>
              <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">
                Líquido
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">
                Status
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} className="border-border/40">
                  <TableCell colSpan={8} className="py-3">
                    <div className="h-6 animate-pulse rounded bg-muted/50" />
                  </TableCell>
                </TableRow>
              ))
            ) : listQuery.isError ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-12 text-center text-sm text-destructive"
                >
                  Falha ao carregar invoices.
                </TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-16">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Inbox
                      className="h-6 w-6 text-muted-foreground/60"
                      aria-hidden="true"
                    />
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Nenhuma invoice
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((inv) => (
                <InvoiceRow
                  key={inv.id}
                  invoice={inv}
                  customer={customerMap.get(inv.customer_id)}
                />
              ))
            )}
          </TableBody>
        </Table>

        {listQuery.hasNextPage ? (
          <div className="border-t border-border/40 p-3 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => listQuery.fetchNextPage()}
              disabled={listQuery.isFetchingNextPage}
              className="text-xs"
            >
              {listQuery.isFetchingNextPage ? 'Carregando...' : 'Carregar mais'}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function InvoiceRow({
  invoice,
  customer,
}: {
  invoice: InvoiceOut
  customer: CustomerOut | undefined
}) {
  const navigate = useNavigate()
  const visual = resolveVisualStatus(invoice.status, invoice.overdue)
  const isOverdue = visual === 'overdue'

  return (
    <TableRow
      className={cn(
        'cursor-pointer border-border/40 transition-colors hover:bg-muted/30',
        isOverdue && 'text-destructive'
      )}
      onClick={() => navigate(`/invoices/${invoice.id}`)}
    >
      <TableCell className="font-mono text-xs tabular-nums">
        {invoice.number ?? (
          <span className="text-muted-foreground">— rascunho</span>
        )}
      </TableCell>
      <TableCell className="max-w-[220px] truncate text-sm font-medium">
        {customer?.legal_name ?? `#${invoice.customer_id}`}
      </TableCell>
      <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatDateBR(invoice.issue_date)}
      </TableCell>
      <TableCell
        className={cn(
          'font-mono text-xs tabular-nums',
          isOverdue ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {formatDateBR(invoice.due_date)}
      </TableCell>
      <TableCell className="text-right font-mono text-sm tabular-nums">
        {formatCurrency(invoice.total, invoice.currency_code)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
        {formatCurrency(invoice.net_amount, invoice.currency_code)}
      </TableCell>
      <TableCell>
        <InvoiceStatusBadge status={invoice.status} overdue={invoice.overdue} />
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Ações"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-border/60">
            <DropdownMenuItem asChild>
              <Link to={`/invoices/${invoice.id}`}>Abrir</Link>
            </DropdownMenuItem>
            {invoice.status === 'draft' ? (
              <RoleGate roles={['admin', 'member']}>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={`/invoices/${invoice.id}/edit`}>Editar</Link>
                </DropdownMenuItem>
              </RoleGate>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

function StatCard({
  label,
  value,
  hint,
  accent,
  loading,
  wide,
}: {
  label: string
  value: string
  hint?: string
  accent: 'primary' | 'destructive' | 'muted'
  loading: boolean
  wide?: boolean
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 shadow-soft',
        wide && 'col-span-2 sm:col-span-1'
      )}
    >
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <FileText className="h-3 w-3" aria-hidden="true" />
        {label}
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-muted/50" />
      ) : (
        <div
          className={cn(
            'mt-1.5 font-mono text-xl font-semibold tabular-nums tracking-tight',
            accent === 'destructive' && 'text-destructive',
            accent === 'primary' && 'text-foreground'
          )}
        >
          {value}
        </div>
      )}
      {hint ? (
        <div className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
          {hint}
        </div>
      ) : null}
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 top-0 h-px',
          accent === 'primary' &&
            'bg-gradient-to-r from-transparent via-primary/60 to-transparent',
          accent === 'destructive' &&
            'bg-gradient-to-r from-transparent via-destructive/60 to-transparent',
          accent === 'muted' &&
            'bg-gradient-to-r from-transparent via-border to-transparent'
        )}
      />
    </div>
  )
}
