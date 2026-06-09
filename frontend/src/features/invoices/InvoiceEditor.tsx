import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFieldArray, useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import Decimal from 'decimal.js'
import {
  ArrowLeft,
  FileText,
  Info,
  Plus,
  Receipt,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CategoryCombobox } from '@/features/categories/CategoryCombobox'
import { customersApi } from '@/lib/api/customers'
import { contractsApi } from '@/lib/api/contracts'
import { issuerApi } from '@/lib/api/issuer'
import {
  invoicesApi,
  type InvoiceCreate,
  type InvoiceOut,
  type InvoiceUpdate,
} from '@/lib/api/invoices'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import {
  invoiceEditorSchema,
  normalizeDecimal,
  type InvoiceEditorValues,
} from './schema'
import {
  computeLineItemTotals,
  extractError,
  toDecimal,
  today,
} from './utils'

const NO_CONTRACT = '__none__'
const NO_CATEGORY = '__none__'
const LABEL = 'text-xs font-medium uppercase tracking-wider text-muted-foreground'
const INPUT =
  'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'

const EMPTY_ITEM = {
  description: '',
  quantity: '1',
  unit_price: '',
  tax_rate: '0',
}

export function InvoiceEditor() {
  const params = useParams<{ id?: string }>()
  const invoiceId = params.id ? Number(params.id) : null
  const isEdit = invoiceId !== null
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const existingQuery = useQuery({
    queryKey: ['invoices', 'detail', invoiceId],
    queryFn: () => invoicesApi.get(invoiceId!),
    enabled: isEdit,
  })

  const customersQuery = useQuery({
    queryKey: ['customers', 'list-all'],
    queryFn: () => customersApi.list({ limit: 200 }),
  })

  const issuerQuery = useQuery({
    queryKey: ['settings', 'issuer'],
    queryFn: () => issuerApi.get(),
  })

  const form = useForm<InvoiceEditorValues>({
    resolver: zodResolver(invoiceEditorSchema),
    defaultValues: {
      customer_id: '',
      contract_id: NO_CONTRACT,
      category_id: NO_CATEGORY,
      due_date: today(),
      issue_date: '',
      service_period_start: '',
      service_period_end: '',
      discount_total: '0',
      po_number: '',
      terms: '',
      notes: '',
      line_items: [EMPTY_ITEM],
    },
  })

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'line_items',
  })

  const selectedCustomerId = form.watch('customer_id')

  const contractsQuery = useQuery({
    queryKey: ['contracts', 'by-customer', selectedCustomerId || null],
    queryFn: () =>
      contractsApi.list({
        customer_id: Number(selectedCustomerId),
        is_active: true,
      }),
    enabled: Boolean(selectedCustomerId),
  })

  // Hydrate from an existing draft (edit mode).
  useEffect(() => {
    if (!isEdit || !existingQuery.data) return
    const inv = existingQuery.data
    form.reset({
      customer_id: String(inv.customer_id),
      contract_id: inv.contract_id ? String(inv.contract_id) : NO_CONTRACT,
      category_id: inv.category_id ? String(inv.category_id) : NO_CATEGORY,
      due_date: inv.due_date,
      issue_date: inv.issue_date ?? '',
      service_period_start: inv.service_period_start ?? '',
      service_period_end: inv.service_period_end ?? '',
      discount_total: inv.discount_total ?? '0',
      po_number: inv.po_number ?? '',
      terms: inv.terms ?? '',
      notes: inv.notes ?? '',
      line_items:
        inv.line_items.length > 0
          ? inv.line_items.map((li) => ({
              description: li.description,
              quantity: li.quantity,
              unit_price: li.unit_price,
              tax_rate: li.tax_rate,
            }))
          : [EMPTY_ITEM],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, existingQuery.data])

  // Live totals (decimal.js — never parseFloat for math).
  const watchedItems = form.watch('line_items')
  const watchedDiscount = form.watch('discount_total')

  const totals = useMemo(() => {
    const { rows, subtotal, taxTotal } = computeLineItemTotals(
      (watchedItems ?? []).map((r) => ({
        quantity: r.quantity ?? '0',
        unit_price: r.unit_price ?? '0',
        tax_rate: r.tax_rate ?? '0',
      }))
    )
    const discountRaw = toDecimal(watchedDiscount)
    const discount = Decimal.min(discountRaw, subtotal).toDecimalPlaces(
      2,
      Decimal.ROUND_HALF_UP
    )
    const total = subtotal
      .minus(discount)
      .plus(taxTotal)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    const fee = toDecimal(issuerQuery.data?.bank_receiving_fee ?? '44')
    const net = total.minus(fee).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    return { rows, subtotal, taxTotal, discount, total, fee, net }
  }, [watchedItems, watchedDiscount, issuerQuery.data])

  function applyContract(contractId: string) {
    if (!contractId || contractId === NO_CONTRACT) return
    const contract = (contractsQuery.data ?? []).find(
      (c) => String(c.id) === contractId
    )
    if (!contract) return
    // Pre-fill terms/discount/tax and seed a single line item from scope/rate.
    form.setValue('discount_total', contract.default_discount || '0')
    const dueOffset = contract.payment_terms_days ?? 30
    const due = new Date()
    due.setDate(due.getDate() + dueOffset)
    form.setValue('due_date', due.toISOString().slice(0, 10))
    if (contract.service_period_start)
      form.setValue('service_period_start', contract.service_period_start)
    if (contract.service_period_end)
      form.setValue('service_period_end', contract.service_period_end)
    if (contract.notes) form.setValue('terms', contract.notes)
    replace([
      {
        description:
          contract.scope_description || contract.title || contract.reference,
        quantity: '1',
        unit_price: contract.agreed_rate ?? '',
        tax_rate: contract.default_tax_rate || '0',
      },
    ])
  }

  function buildPayload(): InvoiceCreate {
    const values = form.getValues()
    return {
      customer_id: Number(values.customer_id),
      contract_id:
        values.contract_id && values.contract_id !== NO_CONTRACT
          ? Number(values.contract_id)
          : null,
      category_id:
        values.category_id && values.category_id !== NO_CATEGORY
          ? Number(values.category_id)
          : null,
      currency_code: 'USD',
      issue_date: values.issue_date ? values.issue_date : null,
      due_date: values.due_date,
      service_period_start: values.service_period_start || null,
      service_period_end: values.service_period_end || null,
      discount_total: normalizeDecimal(values.discount_total || '0'),
      po_number: values.po_number || null,
      terms: values.terms || null,
      notes: values.notes || null,
      line_items: values.line_items.map((li) => ({
        description: li.description,
        quantity: normalizeDecimal(li.quantity),
        unit_price: normalizeDecimal(li.unit_price),
        tax_rate: normalizeDecimal(li.tax_rate),
      })),
    }
  }

  const saveDraftMutation = useMutation({
    mutationFn: async (): Promise<InvoiceOut> => {
      const payload = buildPayload()
      if (isEdit && invoiceId) {
        const update: InvoiceUpdate = { ...payload }
        return invoicesApi.update(invoiceId, update)
      }
      return invoicesApi.create(payload)
    },
    onSuccess: (inv) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Rascunho salvo')
      navigate(`/invoices/${inv.id}`)
    },
    onError: (err) =>
      setServerError(extractError(err, 'Não foi possível salvar o rascunho.')),
  })

  const createAndIssueMutation = useMutation({
    mutationFn: async (): Promise<InvoiceOut> => {
      const payload = buildPayload()
      let draft: InvoiceOut
      if (isEdit && invoiceId) {
        draft = await invoicesApi.update(invoiceId, { ...payload })
      } else {
        draft = await invoicesApi.create(payload)
      }
      return invoicesApi.issue(draft.id)
    },
    onSuccess: (inv) => {
      // Issuing creates a linked Receivable on the Continental account, so
      // refresh receivables/accounts caches alongside invoices.
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['receivables'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(`Invoice ${inv.number ?? ''} emitida`)
      navigate(`/invoices/${inv.id}`)
    },
    onError: (err) =>
      setServerError(extractError(err, 'Não foi possível emitir a invoice.')),
  })

  const pending = saveDraftMutation.isPending || createAndIssueMutation.isPending

  function onSaveDraft() {
    setServerError(null)
    form.handleSubmit(() => saveDraftMutation.mutate())()
  }

  function onCreateAndIssue() {
    setServerError(null)
    form.handleSubmit(() => createAndIssueMutation.mutate())()
  }

  const issuerReady = Boolean(issuerQuery.data?.receiving_account_id)

  if (isEdit && existingQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 animate-pulse rounded bg-muted/50" />
        <div className="h-96 animate-pulse rounded-xl bg-muted/30" />
      </div>
    )
  }

  if (isEdit && existingQuery.data && existingQuery.data.status !== 'draft') {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${invoiceId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-6 text-sm">
          Esta invoice já foi emitida e não pode mais ser editada.
        </div>
      </div>
    )
  }

  return (
    <div className="relative space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
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
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Receipt className="h-3 w-3 text-primary" aria-hidden="true" />
            <span>{isEdit ? 'Editar rascunho' : 'Nova invoice'}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {isEdit ? 'Editar invoice' : 'Criar invoice'}
          </h1>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-primary">
          USD
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Customer & contract */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-card p-5 shadow-soft">
            <SectionTitle>Cliente & contrato</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className={LABEL}>Cliente</Label>
                <Controller
                  control={form.control}
                  name="customer_id"
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={(v) => {
                        field.onChange(v)
                        form.setValue('contract_id', NO_CONTRACT)
                      }}
                    >
                      <SelectTrigger className={INPUT}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {(customersQuery.data?.items ?? []).map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.legal_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.customer_id ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.customer_id.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label className={LABEL}>Contrato (opcional)</Label>
                <Controller
                  control={form.control}
                  name="contract_id"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v)
                        applyContract(v)
                      }}
                      disabled={!selectedCustomerId}
                    >
                      <SelectTrigger className={INPUT}>
                        <SelectValue placeholder="Sem contrato" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CONTRACT}>Sem contrato</SelectItem>
                        {(contractsQuery.data ?? []).map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.reference} — {c.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-[11px] text-muted-foreground">
                  Selecionar um contrato pré-preenche itens e termos.
                </p>
              </div>
            </div>
          </section>

          {/* Line items */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-card p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <SectionTitle>Itens</SectionTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-border/80 text-xs"
                onClick={() => append(EMPTY_ITEM)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Adicionar item
              </Button>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => {
                const lineTotal = totals.rows[index]
                  ? totals.rows[index].subtotal.plus(totals.rows[index].taxTotal)
                  : new Decimal(0)
                return (
                  <div
                    key={field.id}
                    className="space-y-3 rounded-lg border border-border/50 bg-background/40 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label className={LABEL}>Descrição</Label>
                        <Input
                          className={INPUT}
                          placeholder="Serviço prestado..."
                          {...form.register(`line_items.${index}.description`)}
                        />
                        {form.formState.errors.line_items?.[index]
                          ?.description ? (
                          <p className="text-xs text-destructive">
                            {
                              form.formState.errors.line_items[index]
                                ?.description?.message
                            }
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-6 h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => (fields.length > 1 ? remove(index) : null)}
                        disabled={fields.length <= 1}
                        aria-label="Remover item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label className={LABEL}>Qtd.</Label>
                        <Input
                          inputMode="decimal"
                          className={`${INPUT} font-mono tabular-nums`}
                          {...form.register(`line_items.${index}.quantity`)}
                        />
                        {form.formState.errors.line_items?.[index]?.quantity ? (
                          <p className="text-xs text-destructive">
                            {
                              form.formState.errors.line_items[index]?.quantity
                                ?.message
                            }
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <Label className={LABEL}>Preço unit.</Label>
                        <Input
                          inputMode="decimal"
                          placeholder="100.00"
                          className={`${INPUT} font-mono tabular-nums`}
                          {...form.register(`line_items.${index}.unit_price`)}
                        />
                        {form.formState.errors.line_items?.[index]
                          ?.unit_price ? (
                          <p className="text-xs text-destructive">
                            {
                              form.formState.errors.line_items[index]?.unit_price
                                ?.message
                            }
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <Label className={LABEL}>Imposto %</Label>
                        <Input
                          inputMode="decimal"
                          className={`${INPUT} font-mono tabular-nums`}
                          {...form.register(`line_items.${index}.tax_rate`)}
                        />
                        {form.formState.errors.line_items?.[index]?.tax_rate ? (
                          <p className="text-xs text-destructive">
                            {
                              form.formState.errors.line_items[index]?.tax_rate
                                ?.message
                            }
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <Label className={LABEL}>Total</Label>
                        <div className="flex h-10 items-center justify-end rounded-md border border-border/50 bg-muted/30 px-3 font-mono text-sm tabular-nums">
                          {formatCurrency(lineTotal.toFixed(2), 'USD')}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {form.formState.errors.line_items?.root ||
              (typeof form.formState.errors.line_items?.message ===
                'string') ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.line_items?.message}
                </p>
              ) : null}
            </div>
          </section>

          {/* Details */}
          <section className="space-y-4 rounded-xl border border-border/60 bg-card p-5 shadow-soft">
            <SectionTitle>Detalhes</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inv-due" className={LABEL}>
                  Vencimento
                </Label>
                <Input
                  id="inv-due"
                  type="date"
                  className={`${INPUT} font-mono tabular-nums`}
                  {...form.register('due_date')}
                />
                {form.formState.errors.due_date ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.due_date.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label className={LABEL}>Categoria (receita)</Label>
                <Controller
                  control={form.control}
                  name="category_id"
                  render={({ field }) => (
                    <CategoryCombobox
                      value={
                        field.value && field.value !== NO_CATEGORY
                          ? Number(field.value)
                          : null
                      }
                      onChange={(next) =>
                        field.onChange(next == null ? NO_CATEGORY : String(next))
                      }
                      kind="income"
                      placeholder="Categoria padrão do emissor"
                    />
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-period-start" className={LABEL}>
                  Período (início)
                </Label>
                <Input
                  id="inv-period-start"
                  type="date"
                  className={`${INPUT} font-mono tabular-nums`}
                  {...form.register('service_period_start')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-period-end" className={LABEL}>
                  Período (fim)
                </Label>
                <Input
                  id="inv-period-end"
                  type="date"
                  className={`${INPUT} font-mono tabular-nums`}
                  {...form.register('service_period_end')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-po" className={LABEL}>
                  PO Number
                </Label>
                <Input
                  id="inv-po"
                  className={INPUT}
                  {...form.register('po_number')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-discount" className={LABEL}>
                  Desconto (USD)
                </Label>
                <Input
                  id="inv-discount"
                  inputMode="decimal"
                  placeholder="0.00"
                  className={`${INPUT} font-mono tabular-nums`}
                  {...form.register('discount_total')}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-terms" className={LABEL}>
                Termos
              </Label>
              <Textarea
                id="inv-terms"
                rows={2}
                className="border-border/80 bg-background/50 transition-colors focus:border-primary"
                {...form.register('terms')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-notes" className={LABEL}>
                Notas
              </Label>
              <Textarea
                id="inv-notes"
                rows={2}
                className="border-border/80 bg-background/50 transition-colors focus:border-primary"
                {...form.register('notes')}
              />
            </div>
          </section>
        </div>

        {/* Sticky totals sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="space-y-3 rounded-xl border border-border/60 bg-card p-5 shadow-soft">
            <SectionTitle>Totais</SectionTitle>
            <TotalsRow label="Subtotal" value={totals.subtotal} />
            <TotalsRow label="Desconto" value={totals.discount.negated()} />
            <TotalsRow label="Impostos" value={totals.taxTotal} />
            <div className="my-1 h-px bg-border/60" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">Total (USD)</span>
              <span className="font-mono text-xl font-semibold tabular-nums">
                {formatCurrency(totals.total.toFixed(2), 'USD')}
              </span>
            </div>

            <div className="mt-3 space-y-2 rounded-lg border border-success/30 bg-success/5 p-3">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
                  strokeWidth={2.25}
                  aria-hidden="true"
                />
                <span>
                  Líquido a receber = total −{' '}
                  {formatCurrency(totals.fee.toFixed(2), 'USD')} (taxa
                  Continental)
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Líquido
                </span>
                <span className="font-mono text-lg font-semibold tabular-nums text-success">
                  {formatCurrency(totals.net.toFixed(2), 'USD')}
                </span>
              </div>
            </div>
          </div>

          {!issuerReady ? (
            <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
              Configure a conta de recebimento no Emissor (Configurações) antes
              de emitir.
            </div>
          ) : null}

          {serverError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {serverError}
            </div>
          ) : null}

          <div className="space-y-2">
            <Button
              type="button"
              onClick={onCreateAndIssue}
              disabled={pending || !issuerReady}
              className="w-full shadow-[0_0_24px_-8px_var(--color-primary)]"
            >
              {createAndIssueMutation.isPending
                ? 'Emitindo...'
                : 'Criar e emitir'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onSaveDraft}
              disabled={pending}
              className="w-full border-border/80"
            >
              {saveDraftMutation.isPending ? 'Salvando...' : 'Salvar rascunho'}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
      <FileText className="h-3 w-3" aria-hidden="true" />
      {children}
    </div>
  )
}

function TotalsRow({ label, value }: { label: string; value: Decimal }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-mono tabular-nums',
          value.isNegative() && !value.isZero() && 'text-muted-foreground'
        )}
      >
        {formatCurrency(value.toFixed(2), 'USD')}
      </span>
    </div>
  )
}
