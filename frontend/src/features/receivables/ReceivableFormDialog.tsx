import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Repeat } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { accountsApi } from '@/lib/api/accounts'
import { CategoryCombobox } from '@/features/categories/CategoryCombobox'
import {
  receivablesApi,
  type ReceivableCreate,
  type ReceivableOut,
  type ReceivableUpdate,
} from '@/lib/api/receivables'
import type { RecurrenceRule } from '@/lib/api/recurrences'
import { RecurrenceConfigForm } from '@/features/recurrences/RecurrenceConfigForm'

const NO_CATEGORY = '__none__'
const NO_ACCOUNT = '__none__'

const decimalString = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d+)?$/, 'Informe um valor positivo')
  .refine((v) => parseFloat(v.replace(',', '.')) > 0, {
    message: 'O valor deve ser maior que zero',
  })

const CURRENCIES = ['BRL', 'USD', 'PYG'] as const

const baseSchema = z.object({
  description: z.string().trim().min(1, 'Informe a descrição').max(200),
  amount: decimalString,
  currency_code: z.enum(CURRENCIES),
  due_date: z.string().min(1, 'Informe a data de vencimento'),
  account_id: z.string(),
  category_id: z.string(),
  notes: z.string().max(1000).optional(),
})

type FormValues = z.infer<typeof baseSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  receivable?: ReceivableOut | null
}

const LABEL = 'text-xs font-medium uppercase tracking-wider text-muted-foreground'
const INPUT = 'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'

export function ReceivableFormDialog({ open, onOpenChange, receivable }: Props) {
  const isEdit = Boolean(receivable)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isRecurrent, setIsRecurrent] = useState(false)
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(null)

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: false }],
    queryFn: () => accountsApi.list(false),
    enabled: open,
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      description: '',
      amount: '',
      currency_code: 'BRL',
      due_date: today(),
      account_id: NO_ACCOUNT,
      category_id: NO_CATEGORY,
      notes: '',
    },
  })

  const watchedCurrency = form.watch('currency_code')

  const accounts = useMemo(() => {
    return (accountsQuery.data ?? []).filter(
      (a) => !a.is_archived && a.currency_code === watchedCurrency
    )
  }, [accountsQuery.data, watchedCurrency])

  useEffect(() => {
    if (!open) {
      setServerError(null)
      setIsRecurrent(false)
      setRecurrenceRule(null)
      return
    }
    if (isEdit && receivable) {
      form.reset({
        description: receivable.description,
        amount: receivable.amount,
        currency_code: (CURRENCIES.includes(
          receivable.currency_code as typeof CURRENCIES[number]
        )
          ? receivable.currency_code
          : 'BRL') as FormValues['currency_code'],
        due_date: receivable.due_date,
        account_id: receivable.account_id
          ? String(receivable.account_id)
          : NO_ACCOUNT,
        category_id: receivable.category_id
          ? String(receivable.category_id)
          : NO_CATEGORY,
        notes: receivable.notes ?? '',
      })
    } else {
      form.reset({
        description: '',
        amount: '',
        currency_code: 'BRL',
        due_date: today(),
        account_id: NO_ACCOUNT,
        category_id: NO_CATEGORY,
        notes: '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, receivable])

  const createMutation = useMutation({
    mutationFn: (payload: ReceivableCreate) => receivablesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] })
      queryClient.invalidateQueries({ queryKey: ['recurrences'] })
      toast.success('Conta a receber criada')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível criar a conta.'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: ReceivableUpdate) =>
      receivablesApi.update(receivable!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] })
      toast.success('Conta a receber atualizada')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível atualizar a conta.'))
    },
  })

  function handleSubmit(values: FormValues) {
    setServerError(null)
    if (isEdit && receivable) {
      updateMutation.mutate({
        description: values.description,
        amount: normalizeDecimal(values.amount),
        due_date: values.due_date,
        account_id:
          values.account_id === NO_ACCOUNT ? null : Number(values.account_id),
        category_id:
          values.category_id === NO_CATEGORY ? null : Number(values.category_id),
        notes: values.notes ? values.notes : null,
      })
    } else {
      createMutation.mutate({
        description: values.description,
        amount: normalizeDecimal(values.amount),
        currency_code: values.currency_code,
        due_date: values.due_date,
        account_id:
          values.account_id === NO_ACCOUNT ? undefined : Number(values.account_id),
        category_id:
          values.category_id === NO_CATEGORY
            ? undefined
            : Number(values.category_id),
        notes: values.notes || undefined,
        recurrence: isRecurrent && recurrenceRule ? recurrenceRule : undefined,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-border/60 bg-card backdrop-blur-xl sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {isEdit ? 'Editar conta a receber' : 'Nova conta a receber'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize os dados desta conta. A moeda não pode ser alterada.'
              : 'Cadastre uma nova receita com vencimento.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="rec-desc" className={LABEL}>
              Descrição
            </Label>
            <Input id="rec-desc" className={INPUT} {...form.register('description')} />
            {form.formState.errors.description ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.description.message}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rec-amount" className={LABEL}>
                Valor
              </Label>
              <Input
                id="rec-amount"
                inputMode="decimal"
                placeholder="0.00"
                className={`${INPUT} font-mono tabular-nums`}
                {...form.register('amount')}
              />
              {form.formState.errors.amount ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.amount.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label className={LABEL}>Moeda</Label>
              <Controller
                control={form.control}
                name="currency_code"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v)
                      form.setValue('account_id', NO_ACCOUNT)
                    }}
                    disabled={isEdit}
                  >
                    <SelectTrigger className={`${INPUT} font-mono`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rec-due" className={LABEL}>
              Vencimento
            </Label>
            <Input
              id="rec-due"
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className={LABEL}>Conta</Label>
              <Controller
                control={form.control}
                name="account_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={INPUT}>
                      <SelectValue placeholder="Sem conta vinculada" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ACCOUNT}>Sem conta vinculada</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name} ({a.currency_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label className={LABEL}>Categoria</Label>
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
                    placeholder="Sem categoria"
                  />
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rec-notes" className={LABEL}>
              Notas
            </Label>
            <Textarea
              id="rec-notes"
              rows={2}
              className="border-border/80 bg-background/50 transition-colors focus:border-primary"
              {...form.register('notes')}
            />
          </div>

          {!isEdit ? (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label
                    htmlFor="rec-recurrent"
                    className="flex items-center gap-1.5 cursor-pointer text-sm font-medium"
                  >
                    <Repeat className="h-3.5 w-3.5 text-success" strokeWidth={2.25} />
                    Recorrente
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Cria uma regra para gerar próximas ocorrências automaticamente.
                  </p>
                </div>
                <Switch
                  id="rec-recurrent"
                  checked={isRecurrent}
                  onCheckedChange={(v) => setIsRecurrent(Boolean(v))}
                />
              </div>
              {isRecurrent ? (
                <RecurrenceConfigForm
                  value={recurrenceRule}
                  onChange={setRecurrenceRule}
                />
              ) : null}
            </div>
          ) : null}

          {serverError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {serverError}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="shadow-[0_0_24px_-8px_var(--color-success)]"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Salvando...'
                : isEdit
                ? 'Salvar'
                : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function normalizeDecimal(v: string): string {
  return v.trim().replace(',', '.')
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
