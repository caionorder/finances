import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Archive, ArrowLeft, ArrowRight, CheckCircle2, CreditCard, Link2, Plus, Users, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/AuthContext'
import { accountsApi } from '@/lib/api/accounts'
import { categoriesApi, type CategoryOut } from '@/lib/api/categories'
import { creditCardsApi } from '@/lib/api/creditCards'
import { cyclesApi } from '@/lib/api/cycles'
import type { PurchaseOut } from '@/lib/api/purchases'
import { transactionsApi } from '@/lib/api/transactions'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { CycleAccordion } from './CycleAccordion'
import { PurchaseDeleteConfirm } from './PurchaseDeleteConfirm'
import { PurchaseEditDialog } from './PurchaseEditDialog'
import { PurchaseFormDialog } from './PurchaseFormDialog'
import { PurchaseTable } from './PurchaseTable'
import { PurchasesAllInfinite } from './PurchasesAllInfinite'

export function CreditCardDetailPage() {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const cardId = params.id ? Number(params.id) : NaN
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PurchaseOut | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOut | null>(null)

  const cardQuery = useQuery({
    queryKey: ['credit-card', cardId],
    queryFn: () => creditCardsApi.get(cardId),
    enabled: Number.isFinite(cardId),
  })

  const parentId = cardQuery.data?.parent_card_id ?? null
  const isAdditional = parentId != null
  const isDebit = cardQuery.data?.card_type === 'debit'
  const linkedAccountId = cardQuery.data?.payment_account_id ?? null
  const parentQuery = useQuery({
    queryKey: ['credit-card', parentId],
    queryFn: () => creditCardsApi.get(parentId as number),
    enabled: isAdditional && Number.isFinite(parentId as number),
  })

  const childrenQuery = useQuery({
    queryKey: ['credit-card', cardId, 'children'],
    queryFn: () => creditCardsApi.listChildren(cardId),
    enabled: Number.isFinite(cardId) && !isAdditional && !isDebit && cardQuery.isSuccess,
  })

  const linkedAccountQuery = useQuery({
    queryKey: ['account', linkedAccountId, 'balance'],
    queryFn: () => accountsApi.balance(linkedAccountId as number),
    enabled: isDebit && Number.isFinite(linkedAccountId as number),
  })

  const linkedAccountInfoQuery = useQuery({
    queryKey: ['account', linkedAccountId],
    queryFn: () => accountsApi.get(linkedAccountId as number),
    enabled: isDebit && Number.isFinite(linkedAccountId as number),
  })

  const debitTransactionsQuery = useQuery({
    queryKey: ['transactions', { account_id: linkedAccountId, debit_card: cardId }],
    queryFn: () =>
      transactionsApi.list({ account_id: linkedAccountId as number, limit: 50 }),
    enabled: isDebit && Number.isFinite(linkedAccountId as number),
  })

  const aclsQuery = useQuery({
    queryKey: ['credit-card-acls', cardId],
    queryFn: () => creditCardsApi.listAcls(cardId),
    enabled: Number.isFinite(cardId) && isAdmin,
  })

  const canWrite = useMemo(() => {
    if (isAdmin) return true
    if (!user) return false
    if (!aclsQuery.data) return false
    const entry = aclsQuery.data.find((a) => a.user_id === user.id)
    return entry?.permission === 'write'
  }, [isAdmin, user, aclsQuery.data])

  const subQueries = useQueries({
    queries: [
      {
        queryKey: ['cycles', cardId, 'current'],
        queryFn: () => cyclesApi.getCurrent(cardId),
        enabled: Number.isFinite(cardId) && !isDebit && cardQuery.isSuccess,
      },
      {
        queryKey: ['cycles', cardId, 'history'],
        queryFn: () =>
          cyclesApi.list(cardId).then((arr) =>
            arr
              .filter((c) => c.status !== 'open')
              .sort((a, b) => b.period_end.localeCompare(a.period_end))
          ),
        enabled: Number.isFinite(cardId) && !isDebit && cardQuery.isSuccess,
      },
      {
        queryKey: ['categories', 'list-all'],
        queryFn: () => categoriesApi.list(),
      },
    ],
  })

  const currentCycleQuery = subQueries[0]
  const historyCyclesQuery = subQueries[1]
  const categoriesQuery = subQueries[2]

  const currentCycle = currentCycleQuery.data
  const currentCycleId = currentCycle?.id

  const currentPurchasesQuery = useQuery({
    queryKey: ['cycles', cardId, currentCycleId, 'purchases'],
    queryFn: () => cyclesApi.listPurchases(cardId, currentCycleId as number),
    enabled: Number.isFinite(cardId) && typeof currentCycleId === 'number' && !isDebit,
  })

  const categoriesById = useMemo(() => {
    const m = new Map<number, CategoryOut>()
    for (const c of categoriesQuery.data ?? []) m.set(c.id, c)
    return m
  }, [categoriesQuery.data])

  // Map de id→nome dos cartões filhos (pra mostrar "Adicional · Kari" nas compras)
  const cardNamesById = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of childrenQuery.data ?? []) m.set(c.id, c.name)
    return m
  }, [childrenQuery.data])

  if (!Number.isFinite(cardId)) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-6 text-sm text-destructive">
        ID de cartão inválido.
      </div>
    )
  }

  if (cardQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted/60" />
        <div className="h-40 w-full animate-pulse rounded-xl bg-muted/60" />
      </div>
    )
  }

  if (cardQuery.isError || !cardQuery.data) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-6 text-sm text-destructive">
        Falha ao carregar cartão.{' '}
        <Link to="/credit-cards" className="underline">
          Voltar
        </Link>
      </div>
    )
  }

  const card = cardQuery.data
  const overLimit =
    currentCycle &&
    card.limit_amount &&
    parseFloat(currentCycle.total_amount) > parseFloat(card.limit_amount)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="mt-1.5 h-9 w-9">
            <Link to="/credit-cards" aria-label="Voltar">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <CreditCard className="h-3 w-3 text-primary" />
              <span>Cartão</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {card.name}
              </h1>
              <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {card.currency_code}
              </span>
              {isDebit ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-primary">
                  <Wallet className="h-3 w-3" strokeWidth={2.25} />
                  Débito
                </span>
              ) : null}
              {isAdditional ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-primary">
                  <Link2 className="h-3 w-3" strokeWidth={2.25} />
                  Adicional de {parentQuery.data?.name ?? '...'}
                </span>
              ) : null}
              {card.is_archived ? (
                <span className="inline-flex items-center rounded-md border border-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Arquivado
                </span>
              ) : null}
            </div>
            {isDebit ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>
                  Conta vinculada:{' '}
                  <span className="font-medium text-foreground">
                    {linkedAccountInfoQuery.data?.name ?? '—'}
                  </span>
                  {linkedAccountQuery.data ? (
                    <>
                      {' · Saldo '}
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {formatCurrency(
                          linkedAccountQuery.data.current_balance,
                          linkedAccountQuery.data.currency_code
                        )}
                      </span>
                    </>
                  ) : null}
                </span>
                {linkedAccountId ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto gap-1 px-0 text-xs text-primary"
                    onClick={() => navigate(`/accounts/${linkedAccountId}`)}
                  >
                    Ver conta
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
            ) : isAdditional ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>
                  Limite, datas e fatura herdados de{' '}
                  <span className="font-medium text-foreground">
                    {parentQuery.data?.name ?? 'cartão principal'}
                  </span>
                </span>
                {parentId ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto gap-1 px-0 text-xs text-primary"
                    onClick={() => navigate(`/credit-cards/${parentId}`)}
                  >
                    Ver fatura no principal
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Fecha dia{' '}
                <span className="font-mono font-medium text-foreground">
                  {card.closing_day ?? '—'}
                </span>
                {' · '}
                Vence dia{' '}
                <span className="font-mono font-medium text-foreground">
                  {card.due_day ?? '—'}
                </span>
                {card.limit_amount ? (
                  <>
                    {' · '}
                    Limite{' '}
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {formatCurrency(card.limit_amount, card.currency_code)}
                    </span>
                  </>
                ) : null}
              </p>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          'relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft',
          overLimit && 'border-destructive/40 shadow-elevated'
        )}
      >
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-glow-cyan opacity-20 blur-3xl" />
        <div className="relative flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          {isDebit ? (
            <div className="space-y-2">
              <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Saldo da conta vinculada
              </span>
              <p
                className={cn(
                  'font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl',
                  linkedAccountQuery.data &&
                    parseFloat(linkedAccountQuery.data.current_balance) < 0
                    ? 'text-destructive'
                    : 'text-success'
                )}
              >
                {linkedAccountQuery.isLoading
                  ? '—'
                  : linkedAccountQuery.data
                    ? formatCurrency(
                        linkedAccountQuery.data.current_balance,
                        linkedAccountQuery.data.currency_code
                      )
                    : '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                {linkedAccountInfoQuery.data ? (
                  <>
                    Conta{' '}
                    <span className="font-medium text-foreground">
                      {linkedAccountInfoQuery.data.name}
                    </span>
                  </>
                ) : (
                  'Sem conta vinculada'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Próxima fatura
                {currentCycle ? (
                  <>
                    {' · fecha '}
                    <span className="font-medium tabular-nums text-foreground">
                      {formatDateBR(currentCycle.period_end)}
                    </span>
                    {' · vence '}
                    <span className="font-medium tabular-nums text-foreground">
                      {formatDateBR(currentCycle.due_date)}
                    </span>
                  </>
                ) : null}
              </span>
              <p
                className={cn(
                  'font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl',
                  overLimit ? 'text-destructive' : 'text-foreground'
                )}
              >
                {currentCycleQuery.isLoading
                  ? '—'
                  : formatCurrency(
                      currentCycle?.total_amount ?? '0',
                      card.currency_code
                    )}
              </p>
              <p className="text-xs text-muted-foreground">
                {currentCycle ? (
                  <>
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {currentCycle.purchase_count}
                    </span>{' '}
                    {currentCycle.purchase_count === 1 ? 'compra' : 'compras'} neste ciclo
                  </>
                ) : (
                  'Aguardando ciclo atual...'
                )}
              </p>
            </div>
          )}
          {canWrite ? (
            <Button
              size="lg"
              onClick={() => setPurchaseFormOpen(true)}
              disabled={card.is_archived}
              className="shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova compra
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue={isDebit ? 'movements' : 'current'} className="space-y-4">
        <TabsList variant="line" className="border-b border-border/60">
          {isDebit ? (
            <TabsTrigger
              value="movements"
              className="data-active:text-primary data-active:after:!bg-primary"
            >
              Movimentações
            </TabsTrigger>
          ) : (
            <>
              <TabsTrigger
                value="current"
                className="data-active:text-primary data-active:after:!bg-primary"
              >
                Compras desta fatura
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="data-active:text-primary data-active:after:!bg-primary"
              >
                Faturas anteriores
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="data-active:text-primary data-active:after:!bg-primary"
              >
                Todas as compras
              </TabsTrigger>
              {!isAdditional ? (
                <TabsTrigger
                  value="additionals"
                  className="data-active:text-primary data-active:after:!bg-primary"
                >
                  <Users className="mr-1 h-4 w-4" />
                  Adicionais
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                    ({childrenQuery.data?.length ?? 0})
                  </span>
                </TabsTrigger>
              ) : null}
            </>
          )}
        </TabsList>

        {isDebit ? (
          <TabsContent value="movements" className="space-y-3">
            <DebitMovementsList
              isLoading={debitTransactionsQuery.isLoading}
              isError={debitTransactionsQuery.isError}
              transactions={debitTransactionsQuery.data?.items ?? []}
              categoriesById={categoriesById}
            />
          </TabsContent>
        ) : null}

        {!isDebit ? (
        <TabsContent value="current" className="space-y-3">
          <PurchaseTable
            purchases={currentPurchasesQuery.data ?? []}
            categoriesById={categoriesById}
            currencyCode={card.currency_code}
            isLoading={
              currentCycleQuery.isLoading || currentPurchasesQuery.isLoading
            }
            canEdit={canWrite}
            onEdit={(p) => setEditTarget(p)}
            onDelete={(p) => setDeleteTarget(p)}
            emptyMessage="Sem compras nesta fatura ainda."
            showFooterTotal
            currentCardId={cardId}
            cardNamesById={cardNamesById}
          />
        </TabsContent>
        ) : null}

        {!isDebit ? (
        <TabsContent value="history" className="space-y-3">
          {historyCyclesQuery.isLoading ? (
            <div className="rounded-xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
              Carregando faturas anteriores...
            </div>
          ) : (
            <CycleAccordion
              cardId={cardId}
              currencyCode={card.currency_code}
              cycles={historyCyclesQuery.data ?? []}
              categoriesById={categoriesById}
              cardNamesById={cardNamesById}
            />
          )}
        </TabsContent>
        ) : null}

        {!isDebit ? (
        <TabsContent value="all" className="space-y-3">
          <PurchasesAllInfinite
            cardId={cardId}
            currencyCode={card.currency_code}
            categoriesById={categoriesById}
            canEdit={canWrite}
            onEdit={(p) => setEditTarget(p)}
            onDelete={(p) => setDeleteTarget(p)}
            cardNamesById={cardNamesById}
          />
        </TabsContent>
        ) : null}

        {!isAdditional && !isDebit ? (
          <TabsContent value="additionals" className="space-y-3">
            {childrenQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 w-full animate-pulse rounded-lg bg-muted/60"
                  />
                ))}
              </div>
            ) : childrenQuery.isError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-6 text-sm text-destructive">
                Falha ao carregar cartões adicionais.
              </div>
            ) : (childrenQuery.data ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/30 bg-dot-pattern px-6 py-12 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Nenhum cartão adicional</p>
                  <p className="text-xs text-muted-foreground">
                    Crie um pelo botão{' '}
                    <span className="font-medium">Novo cartão</span> e selecione este
                    como Principal.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
                {(childrenQuery.data ?? []).map((child, idx) => (
                  <div
                    key={child.id}
                    className={cn(
                      'flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/30',
                      idx > 0 && 'border-t border-border/40'
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                        <CreditCard className="h-4 w-4" strokeWidth={2.25} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium">
                            {child.name}
                          </span>
                          <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {child.currency_code}
                          </span>
                          {child.is_archived ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              <Archive className="h-3 w-3" />
                              Arquivado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-success">
                              <CheckCircle2 className="h-3 w-3" />
                              Ativo
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          Criado em{' '}
                          {new Date(child.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/credit-cards/${child.id}`)}
                      className="shrink-0 gap-1 text-xs text-primary"
                    >
                      Ver detalhe
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        ) : null}
      </Tabs>

      <PurchaseFormDialog
        open={purchaseFormOpen}
        onOpenChange={setPurchaseFormOpen}
        cardId={cardId}
        currencyCode={card.currency_code}
        parentCardId={card.parent_card_id}
        parentName={parentQuery.data?.name ?? null}
        cardType={card.card_type}
        linkedAccountName={linkedAccountInfoQuery.data?.name ?? null}
      />

      <PurchaseEditDialog
        purchase={editTarget}
        cardId={cardId}
        onClose={() => setEditTarget(null)}
      />

      <PurchaseDeleteConfirm
        purchase={deleteTarget}
        cardId={cardId}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function formatDateBR(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

type DebitMovementsListProps = {
  isLoading: boolean
  isError: boolean
  transactions: Array<{
    id: number
    amount: string
    currency_code: string
    date: string
    description: string | null
    category_id: number | null
    kind: 'income' | 'expense' | 'transfer'
  }>
  categoriesById: Map<number, CategoryOut>
}

function DebitMovementsList({
  isLoading,
  isError,
  transactions,
  categoriesById,
}: DebitMovementsListProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
        Carregando movimentações...
      </div>
    )
  }
  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-6 text-sm text-destructive">
        Falha ao carregar movimentações.
      </div>
    )
  }
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/30 bg-dot-pattern px-6 py-12 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
          <Wallet className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Nenhuma movimentação ainda</p>
          <p className="text-xs text-muted-foreground">
            As compras feitas neste cartão de débito aparecerão aqui.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
      {transactions.map((tx, idx) => {
        const amount = parseFloat(tx.amount)
        const isNegative = !Number.isNaN(amount) && amount < 0
        const cat = tx.category_id ? categoriesById.get(tx.category_id) : null
        return (
          <div
            key={tx.id}
            className={cn(
              'flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/30',
              idx > 0 && 'border-t border-border/40'
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground tabular-nums w-[78px] shrink-0">
                {formatDateBR(tx.date)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm">
                  {tx.description?.trim() ? tx.description : 'Sem descrição'}
                </p>
                {cat ? (
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {cat.name}
                  </p>
                ) : null}
              </div>
            </div>
            <span
              className={cn(
                'font-mono text-sm font-medium tabular-nums shrink-0',
                isNegative ? 'text-destructive' : 'text-success'
              )}
            >
              {formatCurrency(tx.amount, tx.currency_code)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
