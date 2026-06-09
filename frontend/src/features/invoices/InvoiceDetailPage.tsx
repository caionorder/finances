import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Ban,
  Check,
  Download,
  Info,
  Pencil,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RoleGate } from '@/features/auth/RoleGate'
import {
  invoicesApi,
  downloadInvoicePdf,
  type InvoiceStatus,
} from '@/lib/api/invoices'
import { customersApi } from '@/lib/api/customers'
import { receivablesApi } from '@/lib/api/receivables'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { InvoiceStatusBadge } from './status'
import { MarkReceivedDialog } from './MarkReceivedDialog'
import { VoidInvoiceDialog } from './VoidInvoiceDialog'
import { extractError, formatDateBR, toDecimal } from './utils'

const RAIL: { key: InvoiceStatus; label: string }[] = [
  { key: 'draft', label: 'Rascunho' },
  { key: 'issued', label: 'Emitida' },
  { key: 'sent', label: 'Enviada' },
  { key: 'paid', label: 'Paga' },
]

function railIndex(status: InvoiceStatus): number {
  const i = RAIL.findIndex((s) => s.key === status)
  return i < 0 ? 0 : i
}

export function InvoiceDetailPage() {
  const params = useParams<{ id: string }>()
  const invoiceId = Number(params.id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [markReceivedOpen, setMarkReceivedOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const invoiceQuery = useQuery({
    queryKey: ['invoices', 'detail', invoiceId],
    queryFn: () => invoicesApi.get(invoiceId),
  })

  const invoice = invoiceQuery.data

  const customerQuery = useQuery({
    queryKey: ['customers', 'detail', invoice?.customer_id],
    queryFn: () => customersApi.get(invoice!.customer_id),
    enabled: Boolean(invoice?.customer_id),
  })

  const receivableQuery = useQuery({
    queryKey: ['receivables', 'detail', invoice?.receivable_id],
    queryFn: () => receivablesApi.get(invoice!.receivable_id!),
    enabled: Boolean(invoice?.receivable_id),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    queryClient.invalidateQueries({ queryKey: ['receivables'] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
  }

  const issueMutation = useMutation({
    mutationFn: () => invoicesApi.issue(invoiceId),
    onSuccess: (inv) => {
      invalidate()
      toast.success(`Invoice ${inv.number ?? ''} emitida`)
    },
    onError: (err) => toast.error(extractError(err, 'Falha ao emitir.')),
  })

  const markSentMutation = useMutation({
    mutationFn: () => invoicesApi.markSent(invoiceId),
    onSuccess: () => {
      invalidate()
      toast.success('Marcada como enviada')
    },
    onError: (err) => toast.error(extractError(err, 'Falha ao marcar.')),
  })

  const unmarkMutation = useMutation({
    mutationFn: () => invoicesApi.unmarkReceived(invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['receivables'] })
      toast.success('Recebimento desfeito')
    },
    onError: (err) => toast.error(extractError(err, 'Falha ao desfazer.')),
  })

  const deleteMutation = useMutation({
    mutationFn: () => invoicesApi.remove(invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Rascunho excluído')
      navigate('/invoices')
    },
    onError: (err) => toast.error(extractError(err, 'Falha ao excluir.')),
  })

  async function handleDownload() {
    if (!invoice) return
    setDownloading(true)
    try {
      await downloadInvoicePdf(invoice.id, invoice.number)
    } catch (err) {
      toast.error(extractError(err, 'PDF indisponível.'))
    } finally {
      setDownloading(false)
    }
  }

  if (invoiceQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 animate-pulse rounded bg-muted/50" />
        <div className="h-96 animate-pulse rounded-xl bg-muted/30" />
      </div>
    )
  }

  if (invoiceQuery.isError || !invoice) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/invoices')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          Invoice não encontrada.
        </div>
      </div>
    )
  }

  const isVoid = invoice.status === 'void'
  const currentRailIndex = railIndex(invoice.status)
  const hasPdf = Boolean(invoice.pdf_path)
  const received = invoice.status === 'paid'

  return (
    <div className="relative space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-7 text-xs text-muted-foreground"
            onClick={() => navigate('/invoices')}
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Invoices
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
              {invoice.number ?? 'Rascunho'}
            </h1>
            <InvoiceStatusBadge status={invoice.status} overdue={invoice.overdue} />
          </div>
          <p className="text-sm text-muted-foreground">
            {customerQuery.data?.legal_name ?? `Cliente #${invoice.customer_id}`}
          </p>
        </div>

        {/* Action bar (status-gated) */}
        <div className="flex flex-wrap items-center gap-2">
          {invoice.status === 'draft' ? (
            <RoleGate roles={['admin', 'member']}>
              <Button asChild variant="outline" className="border-border/80">
                <Link to={`/invoices/${invoice.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </Button>
              <Button
                onClick={() => issueMutation.mutate()}
                disabled={issueMutation.isPending}
                className="shadow-[0_0_24px_-8px_var(--color-primary)]"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {issueMutation.isPending ? 'Emitindo...' : 'Emitir'}
              </Button>
            </RoleGate>
          ) : null}

          {hasPdf ? (
            <Button
              variant="outline"
              className="border-border/80"
              onClick={handleDownload}
              disabled={downloading}
            >
              <Download className="mr-2 h-4 w-4" />
              {downloading ? 'Baixando...' : 'Baixar PDF'}
            </Button>
          ) : null}

          {invoice.status === 'issued' ? (
            <RoleGate roles={['admin', 'member']}>
              <Button
                variant="outline"
                className="border-border/80"
                onClick={() => markSentMutation.mutate()}
                disabled={markSentMutation.isPending}
              >
                <Send className="mr-2 h-4 w-4" />
                Marcar enviada
              </Button>
            </RoleGate>
          ) : null}

          {(invoice.status === 'issued' || invoice.status === 'sent') &&
          invoice.receivable_id ? (
            <RoleGate roles={['admin', 'member']}>
              <Button
                onClick={() => setMarkReceivedOpen(true)}
                className="bg-success text-success-foreground hover:bg-success/90 shadow-[0_0_24px_-8px_var(--color-success)]"
              >
                <Check className="mr-2 h-4 w-4" />
                Registrar recebimento
              </Button>
            </RoleGate>
          ) : null}

          {received ? (
            <RoleGate roles={['admin', 'member']}>
              <Button
                variant="outline"
                className="border-border/80"
                onClick={() => unmarkMutation.mutate()}
                disabled={unmarkMutation.isPending}
              >
                Desfazer recebimento
              </Button>
            </RoleGate>
          ) : null}

          {invoice.status === 'issued' || invoice.status === 'sent' ? (
            <RoleGate roles={['admin', 'member']}>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setVoidOpen(true)}
              >
                <Ban className="mr-2 h-4 w-4" />
                Anular
              </Button>
            </RoleGate>
          ) : null}

          {invoice.status === 'draft' ? (
            <RoleGate roles={['admin', 'member']}>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
                aria-label="Excluir rascunho"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </RoleGate>
          ) : null}
        </div>
      </div>

      {/* Void banner */}
      {isVoid ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <Ban
            className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-destructive">
              Invoice anulada
            </p>
            {invoice.void_reason ? (
              <p className="text-sm text-muted-foreground">
                Motivo: {invoice.void_reason}
              </p>
            ) : null}
            {invoice.voided_at ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                {formatDateBR(invoice.voided_at)}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        /* Lifecycle rail */
        <div className="rounded-xl border border-border/60 bg-card p-5 shadow-soft">
          <div className="flex items-center">
            {RAIL.map((step, i) => {
              const done = i <= currentRailIndex
              const isCurrent = i === currentRailIndex
              return (
                <div key={step.key} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={cn(
                        'grid h-8 w-8 place-items-center rounded-full border text-xs font-semibold transition-colors',
                        done
                          ? 'border-primary/40 bg-primary/15 text-primary'
                          : 'border-border bg-muted/30 text-muted-foreground',
                        isCurrent &&
                          'ring-2 ring-primary/30 ring-offset-2 ring-offset-card'
                      )}
                    >
                      {done ? <Check className="h-4 w-4" /> : i + 1}
                    </div>
                    <span
                      className={cn(
                        'font-mono text-[10px] uppercase tracking-widest',
                        done ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < RAIL.length - 1 ? (
                    <div
                      className={cn(
                        'mx-2 h-px flex-1 transition-colors',
                        i < currentRailIndex ? 'bg-primary/40' : 'bg-border'
                      )}
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main */}
        <div className="space-y-6">
          {/* Line items */}
          <section className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
            <div className="border-b border-border/40 px-5 py-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Itens
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">
                    Descrição
                  </TableHead>
                  <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">
                    Qtd.
                  </TableHead>
                  <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">
                    Unit.
                  </TableHead>
                  <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">
                    Imp.
                  </TableHead>
                  <TableHead className="text-right font-mono text-[10px] uppercase tracking-widest">
                    Total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.line_items.map((li) => (
                  <TableRow key={li.id} className="border-border/40">
                    <TableCell className="text-sm">{li.description}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {li.quantity}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {formatCurrency(li.unit_price, invoice.currency_code)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {li.tax_rate}%
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCurrency(
                        toDecimal(li.line_subtotal)
                          .plus(toDecimal(li.line_tax))
                          .toFixed(2),
                        invoice.currency_code
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          {/* Meta grid */}
          <section className="grid gap-4 rounded-xl border border-border/60 bg-card p-5 shadow-soft sm:grid-cols-2 lg:grid-cols-3">
            <Meta label="Emissão" value={formatDateBR(invoice.issue_date)} />
            <Meta label="Vencimento" value={formatDateBR(invoice.due_date)} />
            <Meta
              label="Período"
              value={
                invoice.service_period_start
                  ? `${formatDateBR(invoice.service_period_start)} – ${formatDateBR(invoice.service_period_end)}`
                  : '—'
              }
            />
            <Meta label="PO" value={invoice.po_number ?? '—'} />
            <Meta label="Moeda" value={invoice.currency_code} />
            <Meta
              label="Emitida em"
              value={invoice.issued_at ? formatDateBR(invoice.issued_at) : '—'}
            />
          </section>

          {(invoice.terms || invoice.notes) && (
            <section className="space-y-3 rounded-xl border border-border/60 bg-card p-5 shadow-soft">
              {invoice.terms ? (
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Termos
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {invoice.terms}
                  </p>
                </div>
              ) : null}
              {invoice.notes ? (
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Notas
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {invoice.notes}
                  </p>
                </div>
              ) : null}
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Totals */}
          <div className="space-y-3 rounded-xl border border-border/60 bg-card p-5 shadow-soft">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Totais
            </div>
            <SumRow label="Subtotal" value={invoice.subtotal} code={invoice.currency_code} />
            {toDecimal(invoice.discount_total).greaterThan(0) ? (
              <SumRow
                label="Desconto"
                value={`-${invoice.discount_total}`}
                code={invoice.currency_code}
              />
            ) : null}
            <SumRow label="Impostos" value={invoice.tax_total} code={invoice.currency_code} />
            <div className="my-1 h-px bg-border/60" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">Total</span>
              <span className="font-mono text-xl font-semibold tabular-nums">
                {formatCurrency(invoice.total, invoice.currency_code)}
              </span>
            </div>
          </div>

          {/* Linked receivable */}
          <div className="space-y-3 rounded-xl border border-success/30 bg-success/5 p-5 shadow-soft">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Recebível vinculado
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Líquido</span>
              <span className="font-mono text-lg font-semibold tabular-nums text-success">
                {formatCurrency(invoice.net_amount, invoice.currency_code)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Taxa Continental
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">
                −{formatCurrency(invoice.bank_fee_amount, invoice.currency_code)}
              </span>
            </div>
            {invoice.receivable_id ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Estado</span>
                <span
                  className={cn(
                    'font-mono uppercase tracking-wide',
                    received ? 'text-success' : 'text-muted-foreground'
                  )}
                >
                  {receivableQuery.data
                    ? receivableQuery.data.status === 'received'
                      ? 'Recebido'
                      : receivableQuery.data.status === 'overdue'
                        ? 'Vencido'
                        : 'Pendente'
                    : received
                      ? 'Recebido'
                      : 'Pendente'}
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                O recebível é criado ao emitir a invoice.
              </p>
            )}
          </div>

          {/* FX / wire callout */}
          <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs text-muted-foreground">
            <Info
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
              strokeWidth={2.25}
              aria-hidden="true"
            />
            <span>
              Cobrada em USD ao cliente. O crédito final na Continental já é
              líquido de US$ {invoice.bank_fee_amount} (taxa do banco
              recebedor); o cliente transfere o total cheio.
            </span>
          </div>
        </aside>
      </div>

      <MarkReceivedDialog
        invoice={markReceivedOpen ? invoice : null}
        onClose={() => setMarkReceivedOpen(false)}
      />
      <VoidInvoiceDialog
        invoice={voidOpen ? invoice : null}
        onClose={() => setVoidOpen(false)}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="border-border/60 bg-card backdrop-blur-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Excluir rascunho
            </DialogTitle>
            <DialogDescription>
              Esta operação é permanente e só é possível em rascunhos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm tabular-nums">{value}</div>
    </div>
  )
}

function SumRow({
  label,
  value,
  code,
}: {
  label: string
  value: string
  code: string
}) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{formatCurrency(value, code)}</span>
    </div>
  )
}
