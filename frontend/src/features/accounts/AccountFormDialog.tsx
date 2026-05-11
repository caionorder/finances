import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  accountsApi,
  type AccountCreate,
  type AccountUpdate,
  type AccountWithBalance,
  type AccountType,
} from '@/lib/api/accounts'
import { KNOWN_CURRENCIES } from '@/lib/api/currencies'
import { cn } from '@/lib/utils'

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Conta corrente' },
  { value: 'savings', label: 'Poupança' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'investment', label: 'Investimento' },
]

const CURRENCIES = ['BRL', 'USD', 'PYG', 'BTC', 'USDT'] as const
const FIAT_CURRENCIES = KNOWN_CURRENCIES.filter((c) => !c.is_crypto)
const CRYPTO_CURRENCIES = KNOWN_CURRENCIES.filter((c) => c.is_crypto)

const decimalString = z
  .string()
  .trim()
  .regex(/^-?\d+([.,]\d+)?$/, 'Informe um valor numérico válido')

const createSchema = z.object({
  name: z.string().min(1, 'Informe o nome'),
  type: z.enum(['checking', 'savings', 'cash', 'investment'] as const),
  currency_code: z.enum(CURRENCIES),
  opening_balance: decimalString,
  notes: z.string().max(500, 'Máximo 500 caracteres').optional(),
})

const editSchema = z.object({
  name: z.string().min(1, 'Informe o nome'),
  type: z.enum(['checking', 'savings', 'cash', 'investment'] as const),
  opening_balance: decimalString,
  notes: z.string().max(500, 'Máximo 500 caracteres').optional(),
  is_archived: z.boolean(),
})

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: AccountWithBalance | null
}

const labelClass =
  'text-[11px] font-medium uppercase tracking-wider text-muted-foreground'
const inputClass =
  'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'
const submitClass =
  'shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]'

export function AccountFormDialog({ open, onOpenChange, account }: Props) {
  const isEdit = Boolean(account)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: '',
      type: 'checking',
      currency_code: 'BRL',
      opening_balance: '0',
      notes: '',
    },
  })

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: '',
      type: 'checking',
      opening_balance: '0',
      notes: '',
      is_archived: false,
    },
  })

  useEffect(() => {
    if (!open) {
      setServerError(null)
      return
    }
    if (isEdit && account) {
      editForm.reset({
        name: account.name,
        type: account.type,
        opening_balance: account.opening_balance,
        notes: account.notes ?? '',
        is_archived: account.is_archived,
      })
    } else {
      createForm.reset({
        name: '',
        type: 'checking',
        currency_code: 'BRL',
        opening_balance: '0',
        notes: '',
      })
    }
  }, [open, isEdit, account, createForm, editForm])

  const createMutation = useMutation({
    mutationFn: (payload: AccountCreate) => accountsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Conta criada')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível criar a conta.'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: AccountUpdate) => accountsApi.update(account!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Conta atualizada')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível atualizar a conta.'))
    },
  })

  function handleCreate(values: CreateValues) {
    setServerError(null)
    createMutation.mutate({
      name: values.name,
      type: values.type,
      currency_code: values.currency_code,
      opening_balance: normalizeDecimal(values.opening_balance),
      notes: values.notes || undefined,
    })
  }

  function handleEdit(values: EditValues) {
    setServerError(null)
    updateMutation.mutate({
      name: values.name,
      type: values.type,
      opening_balance: normalizeDecimal(values.opening_balance),
      notes: values.notes ?? '',
      is_archived: values.is_archived,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {isEdit ? 'Editar conta' : 'Nova conta'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize os dados da conta. A moeda não pode ser alterada após a criação.'
              : 'Defina nome, tipo, moeda e saldo de abertura.'}
          </DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <form
            onSubmit={editForm.handleSubmit(handleEdit)}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor="acc-edit-name" className={labelClass}>
                Nome
              </Label>
              <Input
                id="acc-edit-name"
                className={inputClass}
                {...editForm.register('name')}
              />
              {editForm.formState.errors.name ? (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className={labelClass}>Tipo</Label>
              <Controller
                control={editForm.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label className={labelClass}>Moeda</Label>
              <Input
                value={account?.currency_code ?? ''}
                disabled
                readOnly
                className="h-10 border-border/60 bg-muted/40 font-mono"
              />
              <p className="text-xs text-muted-foreground">
                A moeda não pode ser alterada após criar a conta.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="acc-edit-opening" className={labelClass}>
                Saldo de abertura
              </Label>
              <Input
                id="acc-edit-opening"
                type="text"
                inputMode="decimal"
                className={cn(inputClass, 'font-mono tabular-nums')}
                {...editForm.register('opening_balance')}
              />
              {editForm.formState.errors.opening_balance ? (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.opening_balance.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="acc-edit-notes" className={labelClass}>
                Observações
              </Label>
              <Textarea
                id="acc-edit-notes"
                rows={3}
                className="border-border/80 bg-background/50 transition-colors focus:border-primary"
                {...editForm.register('notes')}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
              <div className="flex flex-col">
                <Label htmlFor="acc-edit-archived" className="cursor-pointer text-sm font-medium">
                  Arquivada
                </Label>
                <span className="text-xs text-muted-foreground">
                  Contas arquivadas somem da listagem padrão.
                </span>
              </div>
              <Controller
                control={editForm.control}
                name="is_archived"
                render={({ field }) => (
                  <Checkbox
                    id="acc-edit-archived"
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                )}
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
            <div className="space-y-2">
              <Label htmlFor="acc-create-name" className={labelClass}>
                Nome
              </Label>
              <Input
                id="acc-create-name"
                className={inputClass}
                {...createForm.register('name')}
              />
              {createForm.formState.errors.name ? (
                <p className="text-sm text-destructive">
                  {createForm.formState.errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className={labelClass}>Tipo</Label>
                <Controller
                  control={createForm.control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className={inputClass}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label className={labelClass}>Moeda</Label>
                <Controller
                  control={createForm.control}
                  name="currency_code"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className={cn(inputClass, 'font-mono')}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            Fiat
                          </SelectLabel>
                          {FIAT_CURRENCIES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              <span className="font-mono">{c.code}</span> · {c.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            Crypto
                          </SelectLabel>
                          {CRYPTO_CURRENCIES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              <span className="font-mono">
                                {c.symbol} {c.code}
                              </span>{' '}
                              · {c.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="acc-create-opening" className={labelClass}>
                Saldo de abertura
              </Label>
              <Input
                id="acc-create-opening"
                type="text"
                inputMode="decimal"
                className={cn(inputClass, 'font-mono tabular-nums')}
                {...createForm.register('opening_balance')}
              />
              {createForm.formState.errors.opening_balance ? (
                <p className="text-sm text-destructive">
                  {createForm.formState.errors.opening_balance.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="acc-create-notes" className={labelClass}>
                Observações (opcional)
              </Label>
              <Textarea
                id="acc-create-notes"
                rows={3}
                className="border-border/80 bg-background/50 transition-colors focus:border-primary"
                {...createForm.register('notes')}
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
