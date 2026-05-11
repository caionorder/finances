import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useNavigate } from 'react-router-dom'
import { Archive, ArrowRight, CreditCard, Link2, MoreHorizontal, Plus, Shield, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { Checkbox } from '@/components/ui/checkbox'
import { RoleGate } from '@/features/auth/RoleGate'
import { useAuth } from '@/features/auth/AuthContext'
import {
  accountsApi,
  type AccountWithBalance,
} from '@/lib/api/accounts'
import {
  creditCardsApi,
  type CreditCardWithSummary,
} from '@/lib/api/creditCards'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { CreditCardFormDialog } from './CreditCardFormDialog'
import { CreditCardAclDialog } from './CreditCardAclDialog'

export function CreditCardsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [includeArchived, setIncludeArchived] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CreditCardWithSummary | null>(null)
  const [aclTarget, setAclTarget] = useState<CreditCardWithSummary | null>(null)
  const [archiveTarget, setArchiveTarget] =
    useState<CreditCardWithSummary | null>(null)

  const cardsQuery = useQuery({
    queryKey: ['credit-cards', { includeArchived }],
    queryFn: () => creditCardsApi.list(includeArchived),
  })

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: true }],
    queryFn: () => accountsApi.list(true),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: number) => creditCardsApi.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-cards'] })
      toast.success('Cartão arquivado')
      setArchiveTarget(null)
    },
    onError: (err) => {
      toast.error(extractError(err, 'Falha ao arquivar cartão.'))
    },
  })

  const sorted = useMemo(() => {
    if (!cardsQuery.data) return []
    return [...cardsQuery.data].sort((a, b) => {
      if (a.is_archived !== b.is_archived) return a.is_archived ? 1 : -1
      return a.name.localeCompare(b.name, 'pt-BR')
    })
  }, [cardsQuery.data])

  const cardsById = useMemo(() => {
    const m = new Map<number, CreditCardWithSummary>()
    for (const c of cardsQuery.data ?? []) m.set(c.id, c)
    return m
  }, [cardsQuery.data])

  const accountsById = useMemo(() => {
    const m = new Map<number, AccountWithBalance>()
    for (const a of accountsQuery.data ?? []) m.set(a.id, a)
    return m
  }, [accountsQuery.data])

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(card: CreditCardWithSummary) {
    setEditing(card)
    setFormOpen(true)
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <CreditCard className="h-3 w-3 text-primary" />
            <span>Cartões</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Cartões de Crédito
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie seus cartões, faturas e compras parceladas.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            <Checkbox
              checked={includeArchived}
              onCheckedChange={(v) => setIncludeArchived(v === true)}
            />
            Mostrar arquivados
          </label>
          <RoleGate roles={['admin']}>
            <Button
              onClick={openCreate}
              className="shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo cartão
            </Button>
          </RoleGate>
        </div>
      </div>

      {cardsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border/60 bg-card p-5 shadow-soft"
            >
              <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
              <div className="mt-4 h-9 w-40 animate-pulse rounded bg-muted/60" />
              <div className="mt-3 h-3 w-24 animate-pulse rounded bg-muted/60" />
              <div className="mt-4 h-2 w-full animate-pulse rounded bg-muted/60" />
            </div>
          ))}
        </div>
      ) : cardsQuery.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-6 text-center text-sm text-destructive">
          Falha ao carregar cartões.
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/30 bg-dot-pattern px-6 py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {includeArchived ? 'Nenhum cartão cadastrado' : 'Nenhum cartão ativo'}
            </p>
            <p className="text-xs text-muted-foreground">
              Crie um cartão para começar a registrar compras.
            </p>
          </div>
          <RoleGate roles={['admin']}>
            <div className="mt-2">
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Criar primeiro cartão
              </Button>
            </div>
          </RoleGate>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((card) => (
            <CreditCardItem
              key={card.id}
              card={card}
              parent={card.parent_card_id ? cardsById.get(card.parent_card_id) ?? null : null}
              linkedAccount={
                card.card_type === 'debit' && card.payment_account_id
                  ? accountsById.get(card.payment_account_id) ?? null
                  : null
              }
              isAdmin={isAdmin}
              onOpen={() => navigate(`/credit-cards/${card.id}`)}
              onEdit={() => openEdit(card)}
              onAcl={() => setAclTarget(card)}
              onArchive={() => setArchiveTarget(card)}
            />
          ))}
        </div>
      )}

      <CreditCardFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        card={editing}
      />

      <CreditCardAclDialog
        open={aclTarget !== null}
        onOpenChange={(next) => {
          if (!next) setAclTarget(null)
        }}
        card={aclTarget}
      />

      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(next) => {
          if (!next) setArchiveTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-lg border-border/60 bg-card backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Arquivar cartão
            </DialogTitle>
            <DialogDescription>
              O cartão deixará de aparecer na listagem padrão e em filtros, mas
              o histórico de compras é preservado. Pode ser desarquivado depois
              pela edição.
            </DialogDescription>
          </DialogHeader>
          {archiveTarget ? (
            <p className="text-sm">
              Confirma arquivar <strong>{archiveTarget.name}</strong>?
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchiveTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (archiveTarget) archiveMutation.mutate(archiveTarget.id)
              }}
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? 'Arquivando...' : 'Arquivar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type ItemProps = {
  card: CreditCardWithSummary
  parent: CreditCardWithSummary | null
  linkedAccount: AccountWithBalance | null
  isAdmin: boolean
  onOpen: () => void
  onEdit: () => void
  onAcl: () => void
  onArchive: () => void
}

function CreditCardItem({
  card,
  parent,
  linkedAccount,
  isAdmin,
  onOpen,
  onEdit,
  onAcl,
  onArchive,
}: ItemProps) {
  const isDebit = card.card_type === 'debit'
  const isAdditional = card.parent_card_id != null
  const referenceCard = isAdditional && parent ? parent : card
  const cycleTotalNum = parseFloat(referenceCard.current_cycle_total)
  const limitNum = referenceCard.limit_amount
    ? parseFloat(referenceCard.limit_amount)
    : null
  const availableNum = referenceCard.available_credit
    ? parseFloat(referenceCard.available_credit)
    : null
  const hasLimit = limitNum !== null && limitNum > 0
  const usedRatio =
    hasLimit && !Number.isNaN(cycleTotalNum) && limitNum
      ? Math.max(0, Math.min(100, (cycleTotalNum / limitNum) * 100))
      : 0
  const overLimit = hasLimit && limitNum !== null && cycleTotalNum > limitNum
  const nearLimit = hasLimit && usedRatio >= 80 && !overLimit

  const valueTone = overLimit
    ? 'text-destructive'
    : nearLimit
      ? 'text-warning'
      : 'text-foreground'

  const barTone = overLimit
    ? 'bg-destructive'
    : nearLimit
      ? 'bg-warning'
      : 'bg-success'

  const linkedBalanceNum = linkedAccount
    ? parseFloat(linkedAccount.current_balance)
    : null
  const linkedBalanceTone =
    linkedBalanceNum === null
      ? 'text-muted-foreground'
      : linkedBalanceNum < 0
        ? 'text-destructive'
        : linkedBalanceNum === 0
          ? 'text-foreground'
          : 'text-success'

  return (
    <div
      onClick={(e) => {
        // Ignora clicks vindos do dropdown (trigger ou menu items em portal)
        const t = e.target as HTMLElement
        if (
          t.closest('[data-card-action]') ||
          t.closest('[role="menu"]') ||
          t.closest('[role="menuitem"]') ||
          t.closest('[role="dialog"]')
        )
          return
        onOpen()
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if ((e.target as HTMLElement).closest('[data-card-action]')) return
          e.preventDefault()
          onOpen()
        }
      }}
      aria-label={`Abrir ${card.name}`}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-elevated',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        card.is_archived && 'opacity-60'
      )}
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <span className="block truncate text-base font-semibold tracking-tight transition-colors group-hover:text-primary">
              {card.name}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {card.currency_code}
              </span>
              {isDebit ? (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-primary"
                  title="Cartão de débito"
                >
                  <Wallet className="h-3 w-3 shrink-0" strokeWidth={2.25} />
                  Débito
                </span>
              ) : null}
              {isAdditional ? (
                <span
                  className="inline-flex max-w-[180px] items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-primary"
                  title={parent ? `Adicional de ${parent.name}` : 'Cartão adicional'}
                >
                  <Link2 className="h-3 w-3 shrink-0" strokeWidth={2.25} />
                  <span className="truncate">
                    {parent ? `Adicional · ${parent.name}` : 'Adicional'}
                  </span>
                </span>
              ) : null}
              {card.is_archived ? (
                <span className="inline-flex items-center rounded-md border border-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Arquivado
                </span>
              ) : null}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Ações do cartão"
                data-card-action="true"
                className="relative z-20 h-8 w-8"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onOpen}>Ver detalhe</DropdownMenuItem>
              <DropdownMenuItem onSelect={onEdit}>Editar</DropdownMenuItem>
              {isAdmin ? (
                <>
                  <DropdownMenuItem onSelect={onAcl}>
                    <Shield className="mr-2 h-4 w-4" />
                    Gerenciar acessos
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {!card.is_archived ? (
                    <DropdownMenuItem
                      onSelect={onArchive}
                      className="text-destructive focus:text-destructive"
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      Arquivar
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isDebit ? (
          <div className="space-y-1">
            <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Conta vinculada
            </span>
            {linkedAccount ? (
              <>
                <p className="truncate text-base font-medium tracking-tight text-foreground">
                  {linkedAccount.name}
                </p>
                <p
                  className={cn(
                    'font-mono text-3xl font-semibold tracking-tight tabular-nums',
                    linkedBalanceTone
                  )}
                >
                  {formatCurrency(linkedAccount.current_balance, linkedAccount.currency_code)}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Saldo atual
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Conta não encontrada
              </p>
            )}
          </div>
        ) : (
        <>
        <div className="space-y-1">
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {isAdditional ? 'Fatura compartilhada' : 'Próxima fatura'}
          </span>
          {isAdditional ? (
            <>
              {/* Gasto deste cartão adicional (valor próprio) */}
              <p
                className={cn(
                  'font-mono text-3xl font-semibold tracking-tight tabular-nums',
                  valueTone
                )}
              >
                {formatCurrency(card.current_cycle_total, card.currency_code)}
              </p>
              {/* Contexto: fatura consolidada do pai */}
              {parent ? (
                <p className="text-xs text-muted-foreground">
                  Vai pra fatura de{' '}
                  <span className="font-medium text-foreground">{parent.name}</span>
                  {' · '}
                  total{' '}
                  <span className="font-mono tabular-nums text-foreground">
                    {formatCurrency(parent.current_cycle_total, parent.currency_code)}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Compartilha fatura com cartão principal
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Vencimento:{' '}
                <span className="font-mono font-medium tabular-nums text-foreground">
                  {referenceCard.current_cycle_due_date
                    ? formatDateBR(referenceCard.current_cycle_due_date)
                    : '—'}
                </span>
              </p>
            </>
          ) : (
            <>
              <p
                className={cn(
                  'font-mono text-3xl font-semibold tracking-tight tabular-nums',
                  valueTone
                )}
              >
                {formatCurrency(card.current_cycle_total, card.currency_code)}
              </p>
              <p className="text-xs text-muted-foreground">
                Vencimento:{' '}
                <span className="font-mono font-medium tabular-nums text-foreground">
                  {card.current_cycle_due_date
                    ? formatDateBR(card.current_cycle_due_date)
                    : '—'}
                </span>
              </p>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border/40 pt-3">
          <div className="space-y-0.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {isAdditional ? 'Limite (compart.)' : 'Limite'}
            </span>
            <p className="font-mono text-sm font-medium tabular-nums">
              {limitNum !== null
                ? formatCurrency(
                    referenceCard.limit_amount as string,
                    referenceCard.currency_code
                  )
                : 'Sem limite'}
            </p>
          </div>
          <div className="space-y-0.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {isAdditional ? 'Disponível (compart.)' : 'Disponível'}
            </span>
            <p
              className={cn(
                'font-mono text-sm font-medium tabular-nums',
                availableNum !== null && availableNum < 0
                  ? 'text-destructive'
                  : 'text-success'
              )}
            >
              {availableNum !== null
                ? formatCurrency(
                    referenceCard.available_credit as string,
                    referenceCard.currency_code
                  )
                : '—'}
            </p>
          </div>
        </div>

        {hasLimit && !isAdditional ? (
          <div className="space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
              <div
                className={cn('h-full rounded-full transition-all duration-300', barTone)}
                style={{ width: `${usedRatio}%` }}
              />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {usedRatio.toFixed(0)}% utilizado
            </p>
          </div>
        ) : null}
        </>
        )}

        <div className="flex items-center justify-between border-t border-border/40 pt-3">
          {isDebit ? (
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {linkedAccount ? `Conta · ${linkedAccount.name}` : 'Sem conta vinculada'}
            </span>
          ) : isAdditional ? (
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Datas herdadas do principal
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Fecha{' '}
              <span className="font-medium tabular-nums text-foreground">
                {card.closing_day ?? '—'}
              </span>{' '}
              · Vence{' '}
              <span className="font-medium tabular-nums text-foreground">
                {card.due_day ?? '—'}
              </span>
            </span>
          )}
          <span className="flex items-center gap-1 text-xs font-medium text-primary transition-transform group-hover:translate-x-0.5">
            Detalhes
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </div>
  )
}

function formatDateBR(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)
      ?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
