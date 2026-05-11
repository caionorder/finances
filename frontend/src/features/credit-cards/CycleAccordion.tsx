import { useQuery } from '@tanstack/react-query'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import type { CategoryOut } from '@/lib/api/categories'
import { cyclesApi, type CycleOut, type CycleStatus } from '@/lib/api/cycles'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { PurchaseTable } from './PurchaseTable'

const STATUS_LABEL: Record<CycleStatus, string> = {
  open: 'Aberta',
  closed: 'Fechada',
  paid: 'Paga',
}

const STATUS_TONE: Record<CycleStatus, string> = {
  open: 'border-primary/30 bg-primary/10 text-primary',
  closed: 'border-warning/30 bg-warning/10 text-warning',
  paid: 'border-success/30 bg-success/10 text-success',
}

type Props = {
  cardId: number
  currencyCode: string
  cycles: CycleOut[]
  categoriesById: Map<number, CategoryOut>
  cardNamesById?: Map<number, string>
}

export function CycleAccordion({
  cardId,
  currencyCode,
  cycles,
  categoriesById,
  cardNamesById,
}: Props) {
  if (cycles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-10 text-center text-sm text-muted-foreground">
        Nenhuma fatura anterior.
      </div>
    )
  }

  return (
    <Accordion
      type="multiple"
      className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft"
    >
      {cycles.map((c, idx) => (
        <AccordionItem
          key={c.id}
          value={String(c.id)}
          className={cn(
            'border-border/40',
            idx === cycles.length - 1 && 'border-b-0'
          )}
        >
          <AccordionTrigger className="px-4 py-3 hover:bg-accent/30 hover:no-underline">
            <div className="flex w-full items-center justify-between gap-3 pr-2">
              <div className="flex flex-col text-left">
                <span className="text-sm font-semibold tracking-tight">
                  {formatMonth(c.period_end)}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  <span className="tabular-nums text-foreground">{c.purchase_count}</span>{' '}
                  {c.purchase_count === 1 ? 'compra' : 'compras'} · venceu{' '}
                  <span className="tabular-nums text-foreground">
                    {formatDateBR(c.due_date)}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-base font-semibold tabular-nums">
                  {formatCurrency(c.total_amount, currencyCode)}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
                    STATUS_TONE[c.status]
                  )}
                >
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="border-t border-border/40 bg-background/40 px-4 pb-4 pt-3">
            <CyclePurchasesLazy
              cardId={cardId}
              cycleId={c.id}
              currencyCode={currencyCode}
              categoriesById={categoriesById}
              cardNamesById={cardNamesById}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

function CyclePurchasesLazy({
  cardId,
  cycleId,
  currencyCode,
  categoriesById,
  cardNamesById,
}: {
  cardId: number
  cycleId: number
  currencyCode: string
  categoriesById: Map<number, CategoryOut>
  cardNamesById?: Map<number, string>
}) {
  const purchasesQuery = useQuery({
    queryKey: ['cycles', cardId, cycleId, 'purchases'],
    queryFn: () => cyclesApi.listPurchases(cardId, cycleId),
  })

  return (
    <PurchaseTable
      purchases={purchasesQuery.data ?? []}
      categoriesById={categoriesById}
      currencyCode={currencyCode}
      isLoading={purchasesQuery.isLoading}
      canEdit={false}
      emptyMessage="Sem compras nesta fatura."
      showFooterTotal
      currentCardId={cardId}
      cardNamesById={cardNamesById}
    />
  )
}

function formatMonth(value: string): string {
  const [y, m] = value.split('-')
  if (!y || !m) return value
  const months = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ]
  const idx = parseInt(m, 10) - 1
  if (idx < 0 || idx > 11) return value
  return `${months[idx]} ${y}`
}

function formatDateBR(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}
