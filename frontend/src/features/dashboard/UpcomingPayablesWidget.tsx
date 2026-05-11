import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, BellRing, CalendarClock, CheckCircle2, Pencil, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { payablesApi, type PayableOut } from '@/lib/api/payables'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { MarkAsPaidDialog } from '@/features/payables/MarkAsPaidDialog'
import { PayableFormDialog } from '@/features/payables/PayableFormDialog'

const UPCOMING_DAYS = 7
const REFETCH_MS = 5 * 60_000 // 5 min

type UrgencyTone = 'destructive' | 'warning' | 'info'

type UrgencyMeta = {
  tone: UrgencyTone
  label: string
  /** Tonal classes for the badge surface (uses CSS vars, no hardcoded hex). */
  badgeClass: string
}

/**
 * Compact widget for the Dashboard.
 *
 * Shows the next `UPCOMING_DAYS` payables (pending/partially_paid) sorted by
 * due_date. Surfaces "estimated" placeholders (amount=1 or notes flagged) so
 * the user can update the value before paying — utilities use case.
 */
export function UpcomingPayablesWidget() {
  const [paidTarget, setPaidTarget] = useState<PayableOut | null>(null)
  const [editTarget, setEditTarget] = useState<PayableOut | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['payables', 'upcoming', UPCOMING_DAYS],
    queryFn: () => payablesApi.upcoming(UPCOMING_DAYS),
    refetchInterval: REFETCH_MS,
    staleTime: 60_000,
  })

  // Defensive: backend already orders by due_date, but sort again to be safe
  // and drop anything fully paid that may have slipped through.
  const items = useMemo(() => {
    const list = (data ?? []).filter((p) => p.status !== 'paid')
    return [...list].sort((a, b) => a.due_date.localeCompare(b.due_date))
  }, [data])

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
      {/* Subtle ambient glow — Mercury vibe */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 bg-glow-cyan opacity-25"
      />

      <div className="relative flex items-center justify-between border-b border-border/40 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div
            className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30 shadow-[0_0_16px_-4px_var(--color-primary)]"
            aria-hidden="true"
          >
            <BellRing className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <div>
            <div className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Vencimentos
            </div>
            <h3 className="text-[15px] font-semibold tracking-tight">
              Próximos {UPCOMING_DAYS} dias
            </h3>
          </div>
        </div>
        {!isLoading && items.length > 0 ? (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {items.length} {items.length === 1 ? 'item' : 'itens'}
          </span>
        ) : null}
      </div>

      <div className="relative">
        {isLoading ? (
          <UpcomingSkeleton />
        ) : isError ? (
          <UpcomingError />
        ) : items.length === 0 ? (
          <UpcomingEmpty />
        ) : (
          <ul className="divide-y divide-border/40">
            {items.map((p) => (
              <UpcomingRow
                key={p.id}
                payable={p}
                onPay={() => setPaidTarget(p)}
                onEditAmount={() => setEditTarget(p)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="relative border-t border-border/40 bg-muted/30 px-5 py-2.5">
        <Link
          to="/payables"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-primary transition-colors hover:text-primary/80"
        >
          Ver todos
          <ArrowRight className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
        </Link>
      </div>

      {/* Reuse existing dialogs — both invalidate `['payables']` queries on success */}
      <MarkAsPaidDialog payable={paidTarget} onClose={() => setPaidTarget(null)} />
      <PayableFormDialog
        open={editTarget !== null}
        onOpenChange={(next) => {
          if (!next) setEditTarget(null)
        }}
        payable={editTarget}
      />
    </div>
  )
}

type RowProps = {
  payable: PayableOut
  onPay: () => void
  onEditAmount: () => void
}

function UpcomingRow({ payable, onPay, onEditAmount }: RowProps) {
  const urgency = useMemo(() => urgencyFor(payable.due_date), [payable.due_date])
  const estimated = isEstimated(payable)

  return (
    <li className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/30 sm:gap-4">
      {/* Col 1: Date + urgency badge */}
      <div className="flex flex-col items-start gap-1 min-w-[68px]">
        <span className="font-mono text-[13px] font-medium tabular-nums">
          {formatDateShortBR(payable.due_date)}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide',
            urgency.badgeClass
          )}
        >
          {urgency.label}
        </span>
      </div>

      {/* Col 2: Description (+ Estimado flag) */}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight">
          {payable.description}
        </p>
        {estimated ? (
          <span
            className="mt-1 inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide text-warning"
            title="Valor estimado — atualize antes de pagar"
          >
            Estimado
          </span>
        ) : null}
      </div>

      {/* Col 3: Amount (remaining) */}
      <div className="flex flex-col items-end">
        <span
          className={cn(
            'font-mono text-sm font-semibold tabular-nums tracking-tight',
            estimated ? 'text-muted-foreground' : 'text-foreground'
          )}
        >
          {formatCurrency(payable.remaining_amount, payable.currency_code)}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {payable.currency_code}
        </span>
      </div>

      {/* Col 4: Action */}
      <div className="flex shrink-0 items-center">
        {estimated ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-warning/40 bg-warning/5 px-2.5 text-warning hover:bg-warning/10 hover:text-warning"
            onClick={onEditAmount}
          >
            <Pencil className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-8 gap-1.5 px-2.5 shadow-[0_0_16px_-6px_var(--color-primary)]"
            onClick={onPay}
          >
            <Wallet className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
            <span className="hidden sm:inline">Pagar</span>
          </Button>
        )}
      </div>
    </li>
  )
}

function UpcomingEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <CheckCircle2
        className="h-7 w-7 text-success/50"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <p className="text-sm text-muted-foreground">
        Nenhum vencimento nos próximos {UPCOMING_DAYS} dias
      </p>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
        Tudo em dia
      </p>
    </div>
  )
}

function UpcomingSkeleton() {
  return (
    <ul className="divide-y divide-border/40">
      {Array.from({ length: 3 }).map((_, i) => (
        <li
          key={i}
          className="grid grid-cols-[68px_1fr_auto_auto] items-center gap-3 px-5 py-3"
        >
          <div className="space-y-1.5">
            <div className="h-3.5 w-12 animate-pulse rounded bg-muted" />
            <div className="h-3 w-14 animate-pulse rounded bg-muted/70" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted/70" />
          </div>
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-7 w-16 animate-pulse rounded-md bg-muted" />
        </li>
      ))}
    </ul>
  )
}

function UpcomingError() {
  return (
    <div className="flex items-center gap-2 border-y border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
      <CalendarClock className="h-4 w-4" aria-hidden="true" />
      <span>Falha ao carregar vencimentos.</span>
    </div>
  )
}

/**
 * Heuristic to surface placeholder amounts that the user must update before
 * paying. Matches the convention used when manually creating utility bills:
 * amount=1 OR notes flagged with "estimado" / "atualizar valor".
 */
function isEstimated(p: PayableOut): boolean {
  if (Number(p.amount) === 1) return true
  const notes = p.notes?.toLowerCase() ?? ''
  return notes.includes('estimado') || notes.includes('atualizar valor')
}

/**
 * Compute days-until in *local* time, ignoring time-of-day. due_date is an
 * ISO date (YYYY-MM-DD) so we anchor today the same way to avoid timezone
 * drift around midnight.
 */
function daysUntil(dueDate: string): number {
  const [y, m, d] = dueDate.split('-').map(Number)
  if (!y || !m || !d) return 0
  const due = new Date(y, m - 1, d).getTime()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((due - today) / 86_400_000)
}

function urgencyFor(dueDate: string): UrgencyMeta {
  const days = daysUntil(dueDate)
  if (days <= 0) {
    return {
      tone: 'destructive',
      label: days < 0 ? `${Math.abs(days)}d atrás` : 'vence hoje',
      badgeClass: 'border-destructive/40 bg-destructive/10 text-destructive',
    }
  }
  if (days <= 2) {
    return {
      tone: 'warning',
      label: days === 1 ? 'em 1 dia' : `em ${days} dias`,
      badgeClass: 'border-warning/40 bg-warning/10 text-warning',
    }
  }
  return {
    tone: 'info',
    label: `em ${days} dias`,
    // Cyan = our `primary` token; reuse it as the "info" tone to stay on-brand.
    badgeClass: 'border-primary/30 bg-primary/10 text-primary',
  }
}

function formatDateShortBR(value: string): string {
  const [, m, d] = value.split('-')
  if (!m || !d) return value
  return `${d}/${m}`
}
