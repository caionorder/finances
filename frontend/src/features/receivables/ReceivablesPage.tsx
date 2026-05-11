import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  Calendar,
  Inbox,
  MoreHorizontal,
  PiggyBank,
  Plus,
  Repeat,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { accountsApi } from '@/lib/api/accounts'
import { categoriesApi } from '@/lib/api/categories'
import { CategoryCombobox } from '@/features/categories/CategoryCombobox'
import {
  receivablesApi,
  type ReceivableOut,
  type ReceivableStatus,
} from '@/lib/api/receivables'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { ReceivableFormDialog } from './ReceivableFormDialog'
import { MarkAsReceivedDialog } from './MarkAsReceivedDialog'

const ALL = '__all__'
const CURRENCIES = ['BRL', 'USD', 'PYG'] as const

type MonthValue = string
type Tone = 'info' | 'destructive' | 'success'

const COLUMNS: { status: ReceivableStatus; label: string; tone: Tone; pulse?: boolean }[] = [
  { status: 'pending', label: 'Pendente', tone: 'info' },
  { status: 'overdue', label: 'Atrasado', tone: 'destructive', pulse: true },
  { status: 'received', label: 'Recebida', tone: 'success' },
]

const TONE_DOT: Record<Tone, string> = {
  info: 'bg-primary shadow-[0_0_8px_var(--color-primary)]',
  destructive: 'bg-destructive shadow-[0_0_8px_var(--color-destructive)]',
  success: 'bg-success shadow-[0_0_8px_var(--color-success)]',
}

export function ReceivablesPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ReceivableOut | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ReceivableOut | null>(null)
  const [receivedTarget, setReceivedTarget] = useState<ReceivableOut | null>(null)
  const [currency, setCurrency] = useState<string>(ALL)
  const [accountId, setAccountId] = useState<string>(ALL)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [month, setMonth] = useState<MonthValue>(currentMonth())

  const monthRange = useMemo(() => monthBounds(month), [month])

  const categoriesQuery = useQuery({
    queryKey: ['categories', 'list-all'],
    queryFn: () => categoriesApi.list(),
  })

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: false }],
    queryFn: () => accountsApi.list(false),
  })

  const hasFilters =
    currency !== ALL || accountId !== ALL || categoryId !== null

  const categoryMap = useMemo(() => {
    const m = new Map<number, { name: string; color: string | null }>()
    for (const c of categoriesQuery.data ?? []) {
      m.set(c.id, { name: c.name, color: c.color })
    }
    return m
  }, [categoriesQuery.data])

  return (
    <div className="relative space-y-8 animate-fade-in">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 right-16 h-56 w-56 bg-glow-emerald opacity-25"
      />

      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <PiggyBank className="h-3 w-3 text-success" aria-hidden="true" />
            <span>Entradas</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Contas a receber
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe vencimentos, marque recebimentos e controle recorrências.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="shadow-[0_0_24px_-8px_var(--color-success)]"
        >
          <Plus className="mr-2 h-4 w-4" strokeWidth={2.25} />
          Nova conta
        </Button>
      </div>

      <div className="relative flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card p-3 shadow-soft">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Mês
          </span>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
            className="h-9 w-[150px] border-border/80 bg-background/50 font-mono tabular-nums"
          />
        </div>
        <div className="h-6 w-px bg-border/60" aria-hidden="true" />
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Moeda
          </span>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-9 w-[120px] border-border/80 bg-background/50 font-mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="h-6 w-px bg-border/60" aria-hidden="true" />
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Conta
          </span>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="h-9 w-[200px] border-border/80 bg-background/50 text-xs">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as contas</SelectItem>
              {(accountsQuery.data ?? []).map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name} ({a.currency_code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="h-6 w-px bg-border/60" aria-hidden="true" />
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Categoria
          </span>
          <div className="w-[260px]">
            <CategoryCombobox
              value={categoryId}
              onChange={setCategoryId}
              kind="income"
              placeholder="Todas"
              emptyMessage="Nenhuma categoria"
              className="h-9"
            />
          </div>
        </div>
        {hasFilters ? (
          <>
            <div className="h-6 w-px bg-border/60" aria-hidden="true" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCurrency(ALL)
                setAccountId(ALL)
                setCategoryId(null)
              }}
              className="h-8 text-xs"
            >
              Limpar filtros
            </Button>
          </>
        ) : null}
      </div>

      <div className="relative grid grid-cols-1 gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => (
          <ReceivableColumn
            key={col.status}
            status={col.status}
            label={col.label}
            tone={col.tone}
            pulse={col.pulse}
            from={monthRange.from}
            to={monthRange.to}
            currency={currency === ALL ? undefined : currency}
            accountId={accountId === ALL ? undefined : Number(accountId)}
            categoryId={categoryId ?? undefined}
            categoryMap={categoryMap}
            onEdit={setEditing}
            onDelete={setDeleteTarget}
            onMarkReceived={setReceivedTarget}
          />
        ))}
      </div>

      <ReceivableFormDialog
        open={createOpen || editing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCreateOpen(false)
            setEditing(null)
          }
        }}
        receivable={editing}
      />

      <MarkAsReceivedDialog
        receivable={receivedTarget}
        onClose={() => setReceivedTarget(null)}
      />

      <DeleteReceivableDialog
        receivable={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

type ColumnProps = {
  status: ReceivableStatus
  label: string
  tone: Tone
  pulse?: boolean
  from: string
  to: string
  currency: string | undefined
  accountId: number | undefined
  categoryId: number | undefined
  categoryMap: Map<number, { name: string; color: string | null }>
  onEdit: (r: ReceivableOut) => void
  onDelete: (r: ReceivableOut) => void
  onMarkReceived: (r: ReceivableOut) => void
}

function ReceivableColumn({
  status,
  label,
  tone,
  pulse,
  from,
  to,
  currency,
  accountId,
  categoryId,
  categoryMap,
  onEdit,
  onDelete,
  onMarkReceived,
}: ColumnProps) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [
      'receivables',
      {
        status,
        from,
        to,
        currency: currency ?? null,
        account: accountId ?? null,
        category: categoryId ?? null,
      },
    ],
    queryFn: () =>
      receivablesApi.list({
        status,
        from,
        to,
        currency_code: currency,
        account_id: accountId,
        category_id: categoryId,
        limit: 100,
      }),
  })

  const items = query.data?.items ?? []

  const totalsByCurrency = useMemo(() => {
    const totals = new Map<string, number>()
    for (const it of items) {
      const v = parseFloat(it.amount)
      if (Number.isNaN(v)) continue
      totals.set(it.currency_code, (totals.get(it.currency_code) ?? 0) + v)
    }
    return totals
  }, [items])

  const unmarkMutation = useMutation({
    mutationFn: (id: number) => receivablesApi.unmarkAsReceived(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Recebimento desfeito')
    },
    onError: (err) => toast.error(extractError(err, 'Falha ao desfazer.')),
  })

  return (
    <div className="flex flex-col rounded-xl border border-border/60 bg-card shadow-soft">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'status-dot',
              TONE_DOT[tone],
              pulse && 'status-dot-pulse'
            )}
            aria-hidden="true"
          />
          <h2 className="text-sm font-semibold tracking-tight">{label}</h2>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            ({items.length})
          </span>
        </div>
        <div className="space-y-0 text-right">
          {Array.from(totalsByCurrency.entries()).map(([cur, total]) => (
            <div
              key={cur}
              className={cn(
                'font-mono text-[11px] tabular-nums',
                tone === 'success' ? 'text-success' : 'text-muted-foreground'
              )}
            >
              {formatCurrency(total, cur)}
            </div>
          ))}
        </div>
      </div>

      <div className="max-h-[700px] flex-1 space-y-2 overflow-y-auto p-3">
        {query.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg bg-muted/60"
            />
          ))
        ) : query.isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Falha ao carregar.
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-10 text-center">
            <Inbox className="h-5 w-5 text-muted-foreground/60" aria-hidden="true" />
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Sem itens
            </p>
          </div>
        ) : (
          items.map((r) => (
            <ReceivableCard
              key={r.id}
              receivable={r}
              category={r.category_id ? categoryMap.get(r.category_id) : null}
              tone={tone}
              onEdit={() => onEdit(r)}
              onDelete={() => onDelete(r)}
              onMarkReceived={() => onMarkReceived(r)}
              onUnmarkReceived={() => unmarkMutation.mutate(r.id)}
              unmarkPending={unmarkMutation.isPending}
            />
          ))
        )}
      </div>
    </div>
  )
}

type CardProps = {
  receivable: ReceivableOut
  category: { name: string; color: string | null } | null | undefined
  tone: Tone
  onEdit: () => void
  onDelete: () => void
  onMarkReceived: () => void
  onUnmarkReceived: () => void
  unmarkPending: boolean
}

function ReceivableCard({
  receivable,
  category,
  tone,
  onEdit,
  onDelete,
  onMarkReceived,
  onUnmarkReceived,
  unmarkPending,
}: CardProps) {
  const isOverdue = receivable.status === 'overdue'
  const isReceived = receivable.status === 'received'

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border/60 bg-background/60 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-elevated">
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 min-w-0 text-sm font-medium leading-tight">
            {receivable.description}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-1 -mt-1 h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                aria-label="Ações"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border/60">
              <DropdownMenuItem onSelect={onEdit}>Editar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-destructive focus:text-destructive"
              >
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'font-mono text-xl font-semibold tabular-nums tracking-tight',
              isReceived ? 'text-success' : 'text-foreground'
            )}
          >
            {formatCurrency(receivable.amount, receivable.currency_code)}
          </span>
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {receivable.currency_code}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {category ? (
            <span
              className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide"
              style={
                category.color
                  ? {
                      borderColor: `${category.color}55`,
                      backgroundColor: `${category.color}12`,
                      color: category.color,
                    }
                  : undefined
              }
            >
              {category.color ? null : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />}
              {category.name}
            </span>
          ) : null}
          {receivable.recurrence_id ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-primary">
              <Repeat className="h-2.5 w-2.5" strokeWidth={2.5} />
              Recorrente
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <Calendar
            className={cn(
              'h-3.5 w-3.5',
              isOverdue ? 'text-destructive' : 'text-muted-foreground'
            )}
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <span
            className={cn(
              'font-mono tabular-nums',
              isOverdue ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {isReceived && receivable.received_at ? (
              <>Recebido em {formatDateBR(receivable.received_at)}</>
            ) : (
              <>Vence {formatDateBR(receivable.due_date)}</>
            )}
          </span>
        </div>

        {isReceived ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full border-border/80"
            onClick={onUnmarkReceived}
            disabled={unmarkPending}
          >
            {unmarkPending ? 'Desfazendo...' : 'Desfazer recebimento'}
          </Button>
        ) : (
          <Button
            size="sm"
            className={cn(
              'w-full',
              tone === 'destructive'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_0_20px_-8px_var(--color-destructive)]'
                : 'bg-success text-success-foreground hover:bg-success/90 shadow-[0_0_20px_-8px_var(--color-success)]'
            )}
            onClick={onMarkReceived}
          >
            Marcar como recebido
          </Button>
        )}
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 top-0 h-px',
          tone === 'info' && 'bg-gradient-to-r from-transparent via-primary/60 to-transparent',
          tone === 'destructive' && 'bg-gradient-to-r from-transparent via-destructive/60 to-transparent',
          tone === 'success' && 'bg-gradient-to-r from-transparent via-success/60 to-transparent'
        )}
      />
    </div>
  )
}

type DeleteProps = {
  receivable: ReceivableOut | null
  onClose: () => void
}

function DeleteReceivableDialog({ receivable, onClose }: DeleteProps) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (id: number) => receivablesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Conta excluída')
      onClose()
    },
    onError: (err) => toast.error(extractError(err, 'Falha ao excluir.')),
  })

  return (
    <Dialog
      open={receivable !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="border-border/60 bg-card backdrop-blur-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Excluir conta a receber
          </DialogTitle>
          <DialogDescription>
            Esta operação é permanente. Se a conta já estava recebida, a
            transação vinculada também será removida.
          </DialogDescription>
        </DialogHeader>
        {receivable ? (
          <p className="text-sm text-muted-foreground">
            Confirma excluir <strong className="text-foreground">{receivable.description}</strong>?
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (receivable) mutation.mutate(receivable.id)
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function currentMonth(): MonthValue {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function monthBounds(month: MonthValue): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) {
    const fallback = currentMonth()
    return monthBounds(fallback)
  }
  const first = new Date(Date.UTC(y, m - 1, 1))
  const last = new Date(Date.UTC(y, m, 0))
  return { from: isoDate(first), to: isoDate(last) }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatDateBR(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
