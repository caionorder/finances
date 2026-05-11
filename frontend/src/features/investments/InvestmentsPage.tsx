import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useNavigate } from 'react-router-dom'
import {
  Archive,
  ArrowRight,
  MoreHorizontal,
  Plus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  investmentsApi,
  type InvestmentWithPosition,
} from '@/lib/api/investments'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { InvestmentFormDialog } from './InvestmentFormDialog'
import {
  formatDateBR,
  INVESTMENT_TYPE_LABEL,
  toneClass,
  TYPE_TONE,
} from './shared'

export function InvestmentsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [includeArchived, setIncludeArchived] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<InvestmentWithPosition | null>(null)
  const [archiveTarget, setArchiveTarget] =
    useState<InvestmentWithPosition | null>(null)

  const listQuery = useQuery({
    queryKey: ['investments', { includeArchived }],
    queryFn: () => investmentsApi.list(includeArchived),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: number) => investmentsApi.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] })
      toast.success('Investimento arquivado')
      setArchiveTarget(null)
    },
    onError: (err) => {
      toast.error(extractError(err, 'Falha ao arquivar investimento.'))
    },
  })

  const sorted = useMemo(() => {
    if (!listQuery.data) return []
    return [...listQuery.data].sort((a, b) => {
      if (a.is_archived !== b.is_archived) return a.is_archived ? 1 : -1
      return a.name.localeCompare(b.name, 'pt-BR')
    })
  }, [listQuery.data])

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(inv: InvestmentWithPosition) {
    setEditing(inv)
    setFormOpen(true)
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <TrendingUp className="h-3 w-3 text-primary" />
            <span>Investimentos</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Carteira de investimentos
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe posições, rendimento e projete o futuro dos seus ativos.
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
          <Button
            onClick={openCreate}
            className="shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]"
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo investimento
          </Button>
        </div>
      </div>

      {listQuery.isLoading ? (
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
      ) : listQuery.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-6 text-center text-sm text-destructive">
          Falha ao carregar investimentos.
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/30 bg-dot-pattern px-6 py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {includeArchived
                ? 'Nenhum investimento cadastrado'
                : 'Nenhum investimento ativo'}
            </p>
            <p className="text-xs text-muted-foreground">
              Cadastre seu primeiro ativo para começar a acompanhar a posição.
            </p>
          </div>
          <div className="mt-2">
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Criar primeiro investimento
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((inv) => (
            <InvestmentCard
              key={inv.id}
              investment={inv}
              onOpen={() => navigate(`/investments/${inv.id}`)}
              onEdit={() => openEdit(inv)}
              onArchive={() => setArchiveTarget(inv)}
            />
          ))}
        </div>
      )}

      <InvestmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        investment={editing}
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
              Arquivar investimento
            </DialogTitle>
            <DialogDescription>
              O investimento sairá da listagem padrão, mas o histórico de
              movimentos é preservado. É possível desarquivar depois pela
              edição.
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
  investment: InvestmentWithPosition
  onOpen: () => void
  onEdit: () => void
  onArchive: () => void
}

function InvestmentCard({ investment, onOpen, onEdit, onArchive }: CardProps) {
  const gainNum = parseFloat(investment.gross_gain)
  const gainPercentNum = parseFloat(investment.gain_percent)
  const isPositive = !Number.isNaN(gainNum) && gainNum >= 0
  const GainIcon = isPositive ? TrendingUp : TrendingDown
  const gainTone = isPositive ? 'text-success' : 'text-destructive'
  const tone = TYPE_TONE[investment.type]

  return (
    <div
      onClick={(e) => {
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
      aria-label={`Abrir ${investment.name}`}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-elevated',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        investment.is_archived && 'opacity-60'
      )}
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <span className="block truncate text-base font-semibold tracking-tight transition-colors group-hover:text-primary">
              {investment.name}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
                  toneClass(tone)
                )}
              >
                {INVESTMENT_TYPE_LABEL[investment.type]}
              </span>
              <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {investment.currency_code}
              </span>
              {investment.is_archived ? (
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
                aria-label="Ações do investimento"
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
              {!investment.is_archived ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={onArchive}
                    className="text-destructive focus:text-destructive"
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Arquivar
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-1">
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Valor atual
          </span>
          <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-foreground">
            {formatCurrency(investment.current_value, investment.currency_code)}
          </p>
          <div className={cn('flex items-center gap-1.5 text-xs font-medium', gainTone)}>
            <GainIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
            <span className="font-mono tabular-nums">
              {isPositive ? '+' : ''}
              {formatCurrency(investment.gross_gain, investment.currency_code)}
            </span>
            <span className="font-mono tabular-nums opacity-80">
              ({isPositive ? '+' : ''}
              {Number.isFinite(gainPercentNum)
                ? gainPercentNum.toFixed(2)
                : '0.00'}
              %)
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
          <span className="font-mono uppercase tracking-widest">
            Investido{' '}
            <span className="font-medium tabular-nums text-foreground">
              {formatCurrency(
                investment.total_invested,
                investment.currency_code
              )}
            </span>
            {' · '}
            Início{' '}
            <span className="font-medium tabular-nums text-foreground">
              {formatDateBR(investment.start_date)}
            </span>
          </span>
          <span className="flex items-center gap-1 text-xs font-medium text-primary transition-transform group-hover:translate-x-0.5">
            Detalhes
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </div>
  )
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)
      ?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
