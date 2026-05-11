import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Link } from 'react-router-dom'
import { Archive, MoreHorizontal, Plus, Shield, Wallet } from 'lucide-react'
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
import { accountsApi, type AccountWithBalance } from '@/lib/api/accounts'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { AccountFormDialog } from './AccountFormDialog'
import { AccountAclDialog } from './AccountAclDialog'

const typeLabel: Record<string, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Dinheiro',
  investment: 'Investimento',
}

export function AccountsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const queryClient = useQueryClient()

  const [includeArchived, setIncludeArchived] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AccountWithBalance | null>(null)
  const [aclTarget, setAclTarget] = useState<AccountWithBalance | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<AccountWithBalance | null>(null)

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived }],
    queryFn: () => accountsApi.list(includeArchived),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: number) => accountsApi.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Conta arquivada')
      setArchiveTarget(null)
    },
    onError: (err) => {
      toast.error(extractError(err, 'Falha ao arquivar conta.'))
    },
  })

  const sorted = useMemo(() => {
    if (!accountsQuery.data) return []
    return [...accountsQuery.data].sort((a, b) => {
      if (a.is_archived !== b.is_archived) return a.is_archived ? 1 : -1
      return a.name.localeCompare(b.name, 'pt-BR')
    })
  }, [accountsQuery.data])

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(acc: AccountWithBalance) {
    setEditing(acc)
    setFormOpen(true)
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Wallet className="h-3 w-3 text-primary" />
            <span>Contas</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Contas
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie suas contas correntes, poupanças e carteiras.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            <Checkbox
              checked={includeArchived}
              onCheckedChange={(v) => setIncludeArchived(v === true)}
            />
            Mostrar arquivadas
          </label>
          <RoleGate roles={['admin']}>
            <Button
              onClick={openCreate}
              className="shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova conta
            </Button>
          </RoleGate>
        </div>
      </div>

      {accountsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border/60 bg-card p-5 shadow-soft"
            >
              <div className="flex items-start justify-between">
                <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
                <div className="h-8 w-8 animate-pulse rounded-lg bg-muted/60" />
              </div>
              <div className="mt-4 h-8 w-36 animate-pulse rounded bg-muted/60" />
              <div className="mt-3 h-3 w-28 animate-pulse rounded bg-muted/60" />
            </div>
          ))}
        </div>
      ) : accountsQuery.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-6 text-center text-sm text-destructive">
          Falha ao carregar contas.
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/30 bg-dot-pattern px-6 py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {includeArchived ? 'Nenhuma conta cadastrada' : 'Nenhuma conta ativa'}
            </p>
            <p className="text-xs text-muted-foreground">
              {includeArchived
                ? 'Crie uma conta para começar a registrar transações.'
                : 'Crie uma conta para começar.'}
            </p>
          </div>
          <RoleGate roles={['admin']}>
            <div className="mt-2">
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Criar primeira conta
              </Button>
            </div>
          </RoleGate>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onEdit={() => openEdit(acc)}
              onAcl={() => setAclTarget(acc)}
              onArchive={() => setArchiveTarget(acc)}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
      />

      <AccountAclDialog
        open={aclTarget !== null}
        onOpenChange={(next) => {
          if (!next) setAclTarget(null)
        }}
        account={aclTarget}
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
              Arquivar conta
            </DialogTitle>
            <DialogDescription>
              A conta deixará de aparecer na listagem padrão e em filtros, mas o
              histórico de transações é preservado. Pode ser desarquivada depois
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

type CardProps = {
  account: AccountWithBalance
  onEdit: () => void
  onAcl: () => void
  onArchive: () => void
  isAdmin: boolean
}

function AccountCard({ account, onEdit, onAcl, onArchive, isAdmin }: CardProps) {
  const balanceNum = parseFloat(account.current_balance)
  const isNegative = !Number.isNaN(balanceNum) && balanceNum < 0
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-elevated',
        account.is_archived && 'opacity-60'
      )}
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Link
              to={`/transactions?account_id=${account.id}`}
              className="block truncate text-base font-semibold tracking-tight transition-colors hover:text-primary"
            >
              {account.name}
            </Link>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-primary">
                {typeLabel[account.type] ?? account.type}
              </span>
              <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {account.currency_code}
              </span>
              {account.is_archived ? (
                <span className="inline-flex items-center rounded-md border border-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Arquivada
                </span>
              ) : null}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Ações da conta"
                className="h-8 w-8"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>Editar</DropdownMenuItem>
              {isAdmin ? (
                <>
                  <DropdownMenuItem onSelect={onAcl}>
                    <Shield className="mr-2 h-4 w-4" />
                    Gerenciar acessos
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {!account.is_archived ? (
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

        <div className="space-y-1">
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Saldo atual
          </span>
          <p
            className={cn(
              'font-mono text-3xl font-semibold tracking-tight tabular-nums',
              isNegative ? 'text-destructive' : 'text-success'
            )}
          >
            {formatCurrency(account.current_balance, account.currency_code)}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-border/40 pt-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Abertura
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatCurrency(account.opening_balance, account.currency_code)}
          </span>
        </div>

        {account.notes ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {account.notes}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
