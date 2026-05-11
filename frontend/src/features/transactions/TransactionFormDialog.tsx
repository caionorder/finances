import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
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
  transactionsApi,
  type TransactionCreate,
  type TransactionOut,
  type TransactionUpdate,
} from '@/lib/api/transactions'
import { cn } from '@/lib/utils'

const NO_CATEGORY = '__none__'

const decimalString = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d+)?$/, 'Informe um valor positivo')
  .refine((v) => parseFloat(v.replace(',', '.')) > 0, {
    message: 'O valor deve ser maior que zero',
  })

const createSchema = z.object({
  kind: z.enum(['income', 'expense'] as const),
  account_id: z.string().min(1, 'Selecione a conta'),
  amount: decimalString,
  category_id: z.string(),
  date: z.string().min(1, 'Informe a data'),
  description: z.string().max(500).optional(),
})

const editSchema = z.object({
  amount: decimalString,
  category_id: z.string(),
  date: z.string().min(1, 'Informe a data'),
  description: z.string().max(500).optional(),
})

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: TransactionOut | null
}

const labelClass = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground'
const inputClass = 'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'
const submitClass =
  'shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]'

export function TransactionFormDialog({ open, onOpenChange, transaction }: Props) {
  const isEdit = Boolean(transaction)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: false }],
    queryFn: () => accountsApi.list(false),
    enabled: open,
  })

  const accounts = (accountsQuery.data ?? []).filter((a) => !a.is_archived)

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      kind: 'expense',
      account_id: '',
      amount: '',
      category_id: NO_CATEGORY,
      date: today(),
      description: '',
    },
  })

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      amount: '',
      category_id: NO_CATEGORY,
      date: today(),
      description: '',
    },
  })

  useEffect(() => {
    if (!open) {
      setServerError(null)
      return
    }
    if (isEdit && transaction) {
      editForm.reset({
        amount: stripSign(transaction.amount),
        category_id: transaction.category_id ? String(transaction.category_id) : NO_CATEGORY,
        date: transaction.date,
        description: transaction.description ?? '',
      })
    } else {
      createForm.reset({
        kind: 'expense',
        account_id: accounts[0] ? String(accounts[0].id) : '',
        amount: '',
        category_id: NO_CATEGORY,
        date: today(),
        description: '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, transaction])

  const watchedKind = createForm.watch('kind')

  const editKind: 'income' | 'expense' | undefined = useMemo(() => {
    if (!transaction) return undefined
    if (transaction.kind === 'income') return 'income'
    if (transaction.kind === 'expense') return 'expense'
    return undefined
  }, [transaction])

  const createMutation = useMutation({
    mutationFn: (payload: TransactionCreate) => transactionsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Transação criada')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível criar a transação.'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: TransactionUpdate) =>
      transactionsApi.update(transaction!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Transação atualizada')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível atualizar a transação.'))
    },
  })

  function handleCreate(values: CreateValues) {
    setServerError(null)
    createMutation.mutate({
      account_id: Number(values.account_id),
      amount: normalizeDecimal(values.amount),
      kind: values.kind,
      category_id:
        values.category_id === NO_CATEGORY ? undefined : Number(values.category_id),
      date: values.date,
      description: values.description || undefined,
    })
  }

  function handleEdit(values: EditValues) {
    setServerError(null)
    updateMutation.mutate({
      amount: normalizeDecimal(values.amount),
      category_id:
        values.category_id === NO_CATEGORY ? undefined : Number(values.category_id),
      date: values.date,
      description: values.description ?? '',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {isEdit ? 'Editar transação' : 'Nova transação'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize os dados desta transação. O tipo e a conta não podem ser alterados.'
              : 'Lance uma nova receita ou despesa.'}
          </DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <form
            onSubmit={editForm.handleSubmit(handleEdit)}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor="tx-edit-amount" className={labelClass}>
                Valor
              </Label>
              <Input
                id="tx-edit-amount"
                inputMode="decimal"
                className={cn(inputClass, 'font-mono tabular-nums')}
                {...editForm.register('amount')}
              />
              {editForm.formState.errors.amount ? (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.amount.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tx-edit-date" className={labelClass}>
                Data
              </Label>
              <Input
                id="tx-edit-date"
                type="date"
                className={cn(inputClass, 'font-mono')}
                {...editForm.register('date')}
              />
            </div>

            <div className="space-y-2">
              <Label className={labelClass}>Categoria</Label>
              <Controller
                control={editForm.control}
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
                    kind={editKind}
                    placeholder="Sem categoria"
                  />
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tx-edit-desc" className={labelClass}>
                Descrição
              </Label>
              <Textarea
                id="tx-edit-desc"
                rows={3}
                className="border-border/80 bg-background/50 transition-colors focus:border-primary"
                {...editForm.register('description')}
              />
            </div>

            {serverError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={updateMutation.isPending} className={submitClass}>
                {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form
            onSubmit={createForm.handleSubmit(handleCreate)}
            className="space-y-4"
            noValidate
          >
            <Controller
              control={createForm.control}
              name="kind"
              render={({ field }) => (
                <Tabs
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v)
                    createForm.setValue('category_id', NO_CATEGORY)
                  }}
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="expense">Despesa</TabsTrigger>
                    <TabsTrigger value="income">Receita</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />

            <div className="space-y-2">
              <Label className={labelClass}>Conta</Label>
              <Controller
                control={createForm.control}
                name="account_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name} ({a.currency_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {createForm.formState.errors.account_id ? (
                <p className="text-sm text-destructive">
                  {createForm.formState.errors.account_id.message}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tx-create-amount" className={labelClass}>
                  Valor
                </Label>
                <Input
                  id="tx-create-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  className={cn(inputClass, 'font-mono tabular-nums')}
                  {...createForm.register('amount')}
                />
                {createForm.formState.errors.amount ? (
                  <p className="text-sm text-destructive">
                    {createForm.formState.errors.amount.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="tx-create-date" className={labelClass}>
                  Data
                </Label>
                <Input
                  id="tx-create-date"
                  type="date"
                  className={cn(inputClass, 'font-mono')}
                  {...createForm.register('date')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className={labelClass}>Categoria</Label>
              <Controller
                control={createForm.control}
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
                    kind={watchedKind}
                    placeholder="Sem categoria"
                  />
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tx-create-desc" className={labelClass}>
                Descrição (opcional)
              </Label>
              <Textarea
                id="tx-create-desc"
                rows={2}
                className="border-border/80 bg-background/50 transition-colors focus:border-primary"
                {...createForm.register('description')}
              />
            </div>

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
                {createMutation.isPending ? 'Criando...' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        )}
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

function stripSign(v: string): string {
  const trimmed = v.trim()
  return trimmed.startsWith('-') ? trimmed.slice(1) : trimmed
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
