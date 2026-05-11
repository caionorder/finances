import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link2, Wallet } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CategoryCombobox } from '@/features/categories/CategoryCombobox'
import {
  purchasesApi,
  type PurchaseCreate,
} from '@/lib/api/purchases'
import type { CardType } from '@/lib/api/creditCards'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'

const NONE_CATEGORY = '__none__'

const decimalString = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d+)?$/, 'Informe um valor numérico válido')
  .refine(
    (v) => parseFloat(v.replace(',', '.')) > 0,
    'Valor deve ser maior que zero'
  )

const schema = z
  .object({
    description: z.string().max(500, 'Máximo 500 caracteres').optional(),
    merchant: z.string().max(200, 'Máximo 200 caracteres').optional(),
    amount: decimalString,
    purchase_date: z.string().min(1, 'Informe a data'),
    category_id: z.string().optional(),
    is_installment: z.boolean(),
    installments: z
      .number({ message: 'Informe um número' })
      .int('Use número inteiro')
      .min(1, 'Mínimo 1')
      .max(72, 'Máximo 72'),
  })
  .refine(
    (data) => !data.is_installment || data.installments >= 2,
    {
      message: 'Para parcelado informe ao menos 2 parcelas',
      path: ['installments'],
    }
  )

type FormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  cardId: number
  currencyCode: string
  parentCardId?: number | null
  parentName?: string | null
  cardType?: CardType
  linkedAccountName?: string | null
}

const labelClass = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground'
const inputClass = 'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'
const submitClass =
  'shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]'

export function PurchaseFormDialog({
  open,
  onOpenChange,
  cardId,
  currencyCode,
  parentCardId,
  parentName,
  cardType,
  linkedAccountName,
}: Props) {
  const isAdditional = parentCardId != null
  const isDebit = cardType === 'debit'
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: '',
      merchant: '',
      amount: '',
      purchase_date: today,
      category_id: NONE_CATEGORY,
      is_installment: false,
      installments: 1,
    },
  })

  const isInstallment = form.watch('is_installment')
  const installments = form.watch('installments')
  const amountStr = form.watch('amount')

  useEffect(() => {
    if (!open) {
      setServerError(null)
      return
    }
    form.reset({
      description: '',
      merchant: '',
      amount: '',
      purchase_date: today,
      category_id: NONE_CATEGORY,
      is_installment: false,
      installments: 1,
    })
  }, [open, form, today])

  const installmentValueLabel = useMemo(() => {
    if (!isInstallment) return null
    const total = parseFloat((amountStr || '0').replace(',', '.'))
    if (Number.isNaN(total) || total <= 0) return null
    if (!installments || installments < 1) return null
    const per = total / installments
    return formatCurrency(per, currencyCode)
  }, [isInstallment, amountStr, installments, currencyCode])

  const createMutation = useMutation({
    mutationFn: (payload: PurchaseCreate) => purchasesApi.create(cardId, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['cycles', cardId] })
      queryClient.invalidateQueries({ queryKey: ['purchases', cardId] })
      queryClient.invalidateQueries({ queryKey: ['credit-cards'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account'] })
      if (data.installments > 1) {
        toast.success(`Compra em ${data.installments}x registrada`)
      } else {
        toast.success('Compra registrada')
      }
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível registrar a compra.'))
    },
  })

  function handleSubmit(values: FormValues) {
    setServerError(null)
    const payload: PurchaseCreate = {
      amount: normalizeDecimal(values.amount),
      purchase_date: values.purchase_date,
      installments: values.is_installment ? values.installments : 1,
    }
    if (values.description?.trim()) payload.description = values.description.trim()
    if (values.merchant?.trim()) payload.merchant = values.merchant.trim()
    if (values.category_id && values.category_id !== NONE_CATEGORY) {
      payload.category_id = Number(values.category_id)
    }
    createMutation.mutate(payload)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Nova compra
          </DialogTitle>
          <DialogDescription>
            {isDebit
              ? 'Registre uma compra no débito. O valor é descontado direto da conta vinculada.'
              : 'Registre uma compra no cartão. Compras parceladas geram uma série de transações distribuídas pelas próximas faturas.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-4"
          noValidate
        >
          {isDebit ? (
            <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs text-foreground">
              <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                Esta compra debitará{' '}
                <span className="font-mono font-medium tabular-nums">
                  {amountStr && parseFloat(amountStr.replace(',', '.')) > 0
                    ? formatCurrency(
                        parseFloat(amountStr.replace(',', '.')),
                        currencyCode
                      )
                    : '—'}
                </span>
                {' '}da conta{' '}
                <strong className="font-medium">
                  {linkedAccountName ?? 'vinculada'}
                </strong>
                .
              </span>
            </div>
          ) : isAdditional ? (
            <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs text-foreground">
              <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                Esta compra será incluída na fatura de{' '}
                <strong className="font-medium">
                  {parentName ?? 'cartão principal'}
                </strong>
                {' '}(cartão principal).
              </span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="purchase-description" className={labelClass}>
              Descrição
            </Label>
            <Input
              id="purchase-description"
              placeholder="Ex: Notebook"
              className={inputClass}
              {...form.register('description')}
            />
            {form.formState.errors.description ? (
              <p className="text-sm text-destructive">
                {form.formState.errors.description.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchase-merchant" className={labelClass}>
              Estabelecimento (opcional)
            </Label>
            <Input
              id="purchase-merchant"
              placeholder="Ex: Magalu"
              className={inputClass}
              {...form.register('merchant')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="purchase-amount" className={labelClass}>
                {isDebit ? 'Valor da compra' : 'Valor TOTAL da compra'}
              </Label>
              <Input
                id="purchase-amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                className={cn(inputClass, 'font-mono tabular-nums')}
                {...form.register('amount')}
              />
              {form.formState.errors.amount ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.amount.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-date" className={labelClass}>
                Data da compra
              </Label>
              <Input
                id="purchase-date"
                type="date"
                className={cn(inputClass, 'font-mono')}
                {...form.register('purchase_date')}
              />
              {form.formState.errors.purchase_date ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.purchase_date.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label className={labelClass}>Categoria</Label>
            <Controller
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <CategoryCombobox
                  value={
                    field.value && field.value !== NONE_CATEGORY
                      ? Number(field.value)
                      : null
                  }
                  onChange={(next) =>
                    field.onChange(next == null ? NONE_CATEGORY : String(next))
                  }
                  kind="expense"
                  placeholder="Sem categoria"
                />
              )}
            />
          </div>

          {!isDebit ? (
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <Label htmlFor="purchase-installment" className="cursor-pointer text-sm font-medium">
                  Parcelado
                </Label>
                <span className="text-xs text-muted-foreground">
                  Divide o valor total entre múltiplas faturas.
                </span>
              </div>
              <Controller
                control={form.control}
                name="is_installment"
                render={({ field }) => (
                  <Switch
                    id="purchase-installment"
                    checked={field.value}
                    onCheckedChange={(v) => {
                      field.onChange(v)
                      if (!v) form.setValue('installments', 1)
                      else if (form.getValues('installments') < 2) {
                        form.setValue('installments', 2)
                      }
                    }}
                  />
                )}
              />
            </div>

            {isInstallment ? (
              <div className="space-y-2 border-t border-border/40 pt-3">
                <Label htmlFor="purchase-installments" className={labelClass}>
                  Número de parcelas
                </Label>
                <Input
                  id="purchase-installments"
                  type="number"
                  min={2}
                  max={72}
                  step={1}
                  className={cn(inputClass, 'font-mono tabular-nums')}
                  {...form.register('installments', { valueAsNumber: true })}
                />
                {form.formState.errors.installments ? (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.installments.message}
                  </p>
                ) : null}
                {installmentValueLabel ? (
                  <p className="text-xs text-muted-foreground">
                    Cada parcela:{' '}
                    <span className="font-mono font-semibold tabular-nums text-primary">
                      {installmentValueLabel}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          ) : null}

          {serverError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className={submitClass}>
              {createMutation.isPending ? 'Registrando...' : 'Registrar compra'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function normalizeDecimal(v: string): string {
  return v.trim().replace(',', '.')
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)
      ?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
