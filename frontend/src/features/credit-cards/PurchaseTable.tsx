import { useMemo } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import type { CategoryOut } from '@/lib/api/categories'
import type { PurchaseOut } from '@/lib/api/purchases'
import { formatCurrency } from '@/lib/currency'

type Props = {
  purchases: PurchaseOut[]
  categoriesById: Map<number, CategoryOut>
  currencyCode: string
  isLoading?: boolean
  emptyMessage?: string
  canEdit: boolean
  onEdit?: (p: PurchaseOut) => void
  onDelete?: (p: PurchaseOut) => void
  showFooterTotal?: boolean
  /** Quando passado, ID do cartão "pai" sendo visualizado.
   * Compras cujo credit_card_id !== currentCardId ganham badge "Adicional".
   * Pra mostrar o nome do filho, passe cardNamesById também. */
  currentCardId?: number
  cardNamesById?: Map<number, string>
}

const headCellClass =
  'h-10 bg-muted/40 px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground'

export function PurchaseTable({
  purchases,
  categoriesById,
  currencyCode,
  isLoading = false,
  emptyMessage = 'Nenhuma compra encontrada.',
  canEdit,
  onEdit,
  onDelete,
  showFooterTotal = true,
  currentCardId,
  cardNamesById,
}: Props) {
  const total = useMemo(() => {
    return purchases.reduce((sum, p) => {
      const v = parseFloat(p.amount)
      return Number.isNaN(v) ? sum : sum + v
    }, 0)
  }, [purchases])

  const colCount = canEdit ? 6 : 5

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border/60 hover:bg-transparent">
            <TableHead className={`${headCellClass} w-[110px]`}>Data</TableHead>
            <TableHead className={headCellClass}>Descrição</TableHead>
            <TableHead className={headCellClass}>Categoria</TableHead>
            <TableHead className={`${headCellClass} w-[90px] text-center`}>Parcela</TableHead>
            <TableHead className={`${headCellClass} text-right`}>Valor</TableHead>
            {canEdit ? (
              <TableHead className={`${headCellClass} w-[60px] text-right`}>Ações</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="border-b border-border/40">
                {Array.from({ length: colCount }).map((__, j) => (
                  <TableCell key={j} className="py-3">
                    <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : purchases.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={colCount}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            purchases.map((p) => {
              const cat = p.category_id
                ? categoriesById.get(p.category_id)
                : null
              const isSeries = p.installment_of > 1
              return (
                <TableRow
                  key={p.id}
                  className="border-b border-border/40 transition-colors hover:bg-accent/30"
                >
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatDateBR(p.purchase_date)}
                  </TableCell>
                  <TableCell className="max-w-[300px]">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <DescriptionCell text={p.description} />
                        {currentCardId !== undefined &&
                        p.credit_card_id !== currentCardId ? (
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide text-primary"
                            title={`Lançamento do cartão adicional${cardNamesById?.get(p.credit_card_id) ? ` ${cardNamesById.get(p.credit_card_id)}` : ''}`}
                          >
                            {cardNamesById?.get(p.credit_card_id)
                              ? `Adicional · ${cardNamesById.get(p.credit_card_id)}`
                              : 'Adicional'}
                          </span>
                        ) : null}
                      </div>
                      {p.merchant ? (
                        <span className="text-[11px] text-muted-foreground">
                          {p.merchant}
                        </span>
                      ) : null}
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
                  <TableCell className="text-center">
                    {isSeries ? (
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-primary">
                              {p.installment_n}/{p.installment_of}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {p.description ?? 'Compra'} em {p.installment_of}x
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium tabular-nums">
                    {formatCurrency(p.amount, currencyCode)}
                  </TableCell>
                  {canEdit ? (
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
                          {onEdit ? (
                            <DropdownMenuItem onSelect={() => onEdit(p)}>
                              Editar
                            </DropdownMenuItem>
                          ) : null}
                          {onDelete ? (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => onDelete(p)}
                            >
                              Excluir
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : null}
                </TableRow>
              )
            })
          )}
        </TableBody>
        {showFooterTotal && purchases.length > 0 ? (
          <TableFooter>
            <TableRow className="border-t border-border/60 bg-muted/30 hover:bg-muted/30">
              <TableCell
                colSpan={4}
                className="text-right font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground"
              >
                Total
              </TableCell>
              <TableCell className="text-right font-mono text-base font-semibold tabular-nums">
                {formatCurrency(total, currencyCode)}
              </TableCell>
              {canEdit ? <TableCell /> : null}
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
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

function formatDateBR(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}
