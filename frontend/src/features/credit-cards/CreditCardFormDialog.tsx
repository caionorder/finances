import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CreditCard, Info, Link2, Wallet } from 'lucide-react'
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
import { accountsApi } from '@/lib/api/accounts'
import {
  creditCardsApi,
  type CreditCardCreate,
  type CreditCardUpdate,
  type CreditCardWithSummary,
} from '@/lib/api/creditCards'
import { KNOWN_CURRENCIES } from '@/lib/api/currencies'
import { cn } from '@/lib/utils'

const CURRENCIES = ['BRL', 'USD', 'PYG', 'BTC', 'USDT'] as const
const FIAT_CURRENCIES = KNOWN_CURRENCIES.filter((c) => !c.is_crypto)
const CRYPTO_CURRENCIES = KNOWN_CURRENCIES.filter((c) => c.is_crypto)

const NONE_ACCOUNT = '__none__'
const NONE_PARENT = '__none__'

const dayValue = z
  .number({ message: 'Informe um número' })
  .int('Use número inteiro')
  .min(1, 'Mínimo 1')
  .max(31, 'Máximo 31')
  .optional()

const dayRegisterOptions = {
  setValueAs: (v: unknown): number | undefined => {
    if (v === '' || v === null || v === undefined) return undefined
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isNaN(n) ? undefined : n
  },
}

const createSchema = z
  .object({
    name: z.string().min(1, 'Informe o nome'),
    card_type: z.enum(['credit', 'debit']),
    currency_code: z.enum(CURRENCIES),
    limit_amount: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => !v || /^\d+([.,]\d+)?$/.test(v),
        'Informe um valor numérico válido'
      )
      .refine(
        (v) => !v || parseFloat(v.replace(',', '.')) > 0,
        'Limite deve ser maior que zero'
      ),
    closing_day: dayValue,
    due_day: dayValue,
    payment_account_id: z.string().optional(),
    parent_card_id: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const isAdditional = !!data.parent_card_id && data.parent_card_id !== NONE_PARENT
    if (data.card_type === 'debit') {
      if (isAdditional) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Cartões de débito não podem ser adicionais',
          path: ['parent_card_id'],
        })
      }
      if (!data.payment_account_id || data.payment_account_id === NONE_ACCOUNT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Selecione a conta vinculada',
          path: ['payment_account_id'],
        })
      }
      return
    }
    if (!isAdditional) {
      if (data.closing_day == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Informe o dia de fechamento',
          path: ['closing_day'],
        })
      }
      if (data.due_day == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Informe o dia de vencimento',
          path: ['due_day'],
        })
      }
    }
  })

const editSchema = z
  .object({
    name: z.string().min(1, 'Informe o nome'),
    limit_amount: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => !v || /^\d+([.,]\d+)?$/.test(v),
        'Informe um valor numérico válido'
      )
      .refine(
        (v) => !v || parseFloat(v.replace(',', '.')) > 0,
        'Limite deve ser maior que zero'
      ),
    closing_day: dayValue,
    due_day: dayValue,
    payment_account_id: z.string().optional(),
    is_archived: z.boolean(),
  })

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  card?: CreditCardWithSummary | null
}

const labelClass = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground'
const inputClass = 'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'
const submitClass =
  'shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]'

export function CreditCardFormDialog({ open, onOpenChange, card }: Props) {
  const isEdit = Boolean(card)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: false }],
    queryFn: () => accountsApi.list(false),
    enabled: open,
  })

  const cardsQuery = useQuery({
    queryKey: ['credit-cards', { includeArchived: false }],
    queryFn: () => creditCardsApi.list(false),
    enabled: open,
  })

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: '',
      card_type: 'credit',
      currency_code: 'BRL',
      limit_amount: '',
      closing_day: 1,
      due_day: 10,
      payment_account_id: NONE_ACCOUNT,
      parent_card_id: NONE_PARENT,
    },
  })

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: '',
      limit_amount: '',
      closing_day: 1,
      due_day: 10,
      payment_account_id: NONE_ACCOUNT,
      is_archived: false,
    },
  })

  const watchedCurrency = createForm.watch('currency_code')
  const watchedParent = createForm.watch('parent_card_id')
  const watchedCardType = createForm.watch('card_type')
  const isDebitCreate = watchedCardType === 'debit'
  const isAdditionalCreate =
    !!watchedParent && watchedParent !== NONE_PARENT && !isDebitCreate
  const isAdditionalEdit = isEdit && card?.parent_card_id != null
  const isDebitEdit = isEdit && card?.card_type === 'debit'

  const eligibleParents = useMemo(() => {
    const all = cardsQuery.data ?? []
    return all
      .filter((c) => c.parent_card_id == null && !c.is_archived)
      .filter((c) => !card || c.id !== card.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [cardsQuery.data, card])

  const selectedParent = useMemo(() => {
    if (!isAdditionalCreate) return null
    const id = Number(watchedParent)
    return (cardsQuery.data ?? []).find((c) => c.id === id) ?? null
  }, [isAdditionalCreate, watchedParent, cardsQuery.data])

  const editParent = useMemo(() => {
    if (!isAdditionalEdit || !card?.parent_card_id) return null
    return (cardsQuery.data ?? []).find((c) => c.id === card.parent_card_id) ?? null
  }, [isAdditionalEdit, card, cardsQuery.data])

  useEffect(() => {
    if (!open) {
      setServerError(null)
      return
    }
    if (isEdit && card) {
      editForm.reset({
        name: card.name,
        limit_amount: card.limit_amount ?? '',
        closing_day: card.closing_day ?? undefined,
        due_day: card.due_day ?? undefined,
        payment_account_id: card.payment_account_id
          ? String(card.payment_account_id)
          : NONE_ACCOUNT,
        is_archived: card.is_archived,
      })
    } else {
      createForm.reset({
        name: '',
        card_type: 'credit',
        currency_code: 'BRL',
        limit_amount: '',
        closing_day: 1,
        due_day: 10,
        payment_account_id: NONE_ACCOUNT,
        parent_card_id: NONE_PARENT,
      })
    }
  }, [open, isEdit, card, createForm, editForm])

  useEffect(() => {
    if (isEdit) return
    if (selectedParent) {
      const parentCurrency = selectedParent.currency_code as (typeof CURRENCIES)[number]
      if (CURRENCIES.includes(parentCurrency)) {
        createForm.setValue('currency_code', parentCurrency)
      }
      createForm.setValue('payment_account_id', NONE_ACCOUNT)
    }
  }, [selectedParent, isEdit, createForm])

  useEffect(() => {
    if (isEdit) return
    if (isDebitCreate) {
      createForm.setValue('parent_card_id', NONE_PARENT)
      createForm.setValue('limit_amount', '')
      createForm.setValue('closing_day', undefined as unknown as number)
      createForm.setValue('due_day', undefined as unknown as number)
    }
  }, [isDebitCreate, isEdit, createForm])

  const eligibleAccounts = useMemo(() => {
    const targetCurrency = isEdit ? card?.currency_code : watchedCurrency
    if (!targetCurrency) return []
    return (accountsQuery.data ?? [])
      .filter((a) => !a.is_archived && a.currency_code === targetCurrency)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [accountsQuery.data, isEdit, card?.currency_code, watchedCurrency])

  const createMutation = useMutation({
    mutationFn: (payload: CreditCardCreate) => creditCardsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-cards'] })
      toast.success('Cartão criado')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível criar o cartão.'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: CreditCardUpdate) =>
      creditCardsApi.update(card!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-cards'] })
      toast.success('Cartão atualizado')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível atualizar o cartão.'))
    },
  })

  function handleCreate(values: CreateValues) {
    setServerError(null)
    const payload: CreditCardCreate = {
      name: values.name,
      card_type: values.card_type,
      currency_code: values.currency_code,
    }
    if (values.card_type === 'debit') {
      if (
        values.payment_account_id &&
        values.payment_account_id !== NONE_ACCOUNT
      ) {
        payload.payment_account_id = Number(values.payment_account_id)
      }
      createMutation.mutate(payload)
      return
    }
    const isAdditional =
      !!values.parent_card_id && values.parent_card_id !== NONE_PARENT
    if (isAdditional) {
      payload.parent_card_id = Number(values.parent_card_id)
    } else {
      if (values.closing_day != null) payload.closing_day = values.closing_day
      if (values.due_day != null) payload.due_day = values.due_day
      if (values.limit_amount && values.limit_amount.trim()) {
        payload.limit_amount = normalizeDecimal(values.limit_amount)
      }
      if (
        values.payment_account_id &&
        values.payment_account_id !== NONE_ACCOUNT
      ) {
        payload.payment_account_id = Number(values.payment_account_id)
      }
    }
    createMutation.mutate(payload)
  }

  function handleEdit(values: EditValues) {
    setServerError(null)
    const payload: CreditCardUpdate = {
      name: values.name,
      is_archived: values.is_archived,
    }
    if (isDebitEdit) {
      payload.payment_account_id =
        values.payment_account_id && values.payment_account_id !== NONE_ACCOUNT
          ? Number(values.payment_account_id)
          : null
    } else if (!isAdditionalEdit) {
      if (values.closing_day != null) payload.closing_day = values.closing_day
      if (values.due_day != null) payload.due_day = values.due_day
      payload.payment_account_id =
        values.payment_account_id && values.payment_account_id !== NONE_ACCOUNT
          ? Number(values.payment_account_id)
          : null
      if (values.limit_amount && values.limit_amount.trim()) {
        payload.limit_amount = normalizeDecimal(values.limit_amount)
      }
    }
    updateMutation.mutate(payload)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {isEdit ? 'Editar cartão' : 'Novo cartão'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize os dados do cartão. Tipo, moeda e cartão principal não podem ser alterados após a criação.'
              : 'Escolha o tipo (crédito ou débito), nome e moeda. Crédito tem limite e ciclo de fatura; débito desconta direto da conta vinculada.'}
          </DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <form
            onSubmit={editForm.handleSubmit(handleEdit)}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <Label className={labelClass}>Tipo do cartão</Label>
              <Input
                value={card?.card_type === 'debit' ? 'Débito' : 'Crédito'}
                disabled
                readOnly
                className="h-10 border-border/60 bg-muted/40"
              />
              <p className="text-xs text-muted-foreground">
                O tipo não pode ser alterado após criar o cartão.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cc-edit-name" className={labelClass}>Nome</Label>
              <Input id="cc-edit-name" className={inputClass} {...editForm.register('name')} />
              {editForm.formState.errors.name ? (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.name.message}
                </p>
              ) : null}
            </div>

            {!isDebitEdit ? (
              <div className="space-y-2">
                <Label className={labelClass}>Cartão principal</Label>
                <Input
                  value={
                    isAdditionalEdit
                      ? editParent?.name ?? `#${card?.parent_card_id ?? ''}`
                      : 'Nenhum (este é um cartão principal)'
                  }
                  disabled
                  readOnly
                  className="h-10 border-border/60 bg-muted/40"
                />
                <p className="text-xs text-muted-foreground">
                  O vínculo de cartão principal não pode ser alterado após a criação.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label className={labelClass}>Moeda</Label>
              <Input
                value={card?.currency_code ?? ''}
                disabled
                readOnly
                className="h-10 border-border/60 bg-muted/40 font-mono"
              />
              <p className="text-xs text-muted-foreground">
                A moeda não pode ser alterada após criar o cartão.
              </p>
            </div>

            {isDebitEdit ? (
              <>
                <DebitInfoBanner />
                <div className="space-y-2">
                  <Label className={labelClass}>Conta vinculada</Label>
                  <Controller
                    control={editForm.control}
                    name="payment_account_id"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className={inputClass}>
                          <SelectValue placeholder="Selecione a conta" />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleAccounts.map((a) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Contas com a mesma moeda do cartão ({card?.currency_code}).
                  </p>
                </div>
              </>
            ) : isAdditionalEdit ? (
              <AdditionalInheritNote parentName={editParent?.name} />
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="cc-edit-limit" className={labelClass}>Limite (opcional)</Label>
                  <Input
                    id="cc-edit-limit"
                    type="text"
                    inputMode="decimal"
                    placeholder="Sem limite"
                    className={cn(inputClass, 'font-mono tabular-nums')}
                    {...editForm.register('limit_amount')}
                  />
                  {editForm.formState.errors.limit_amount ? (
                    <p className="text-sm text-destructive">
                      {editForm.formState.errors.limit_amount.message}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <DayField
                    id="cc-edit-closing"
                    label="Dia de fechamento"
                    error={editForm.formState.errors.closing_day?.message}
                    {...editForm.register('closing_day', dayRegisterOptions)}
                  />
                  <DayField
                    id="cc-edit-due"
                    label="Dia de vencimento"
                    error={editForm.formState.errors.due_day?.message}
                    {...editForm.register('due_day', dayRegisterOptions)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className={labelClass}>Conta de pagamento (opcional)</Label>
                  <Controller
                    control={editForm.control}
                    name="payment_account_id"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className={inputClass}>
                          <SelectValue placeholder="Nenhuma conta vinculada" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_ACCOUNT}>
                            Nenhuma conta vinculada
                          </SelectItem>
                          {eligibleAccounts.map((a) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Lista contas com a mesma moeda do cartão ({card?.currency_code}).
                  </p>
                </div>
              </>
            )}

            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
              <div className="flex flex-col">
                <Label htmlFor="cc-edit-archived" className="cursor-pointer text-sm font-medium">
                  Arquivado
                </Label>
                <span className="text-xs text-muted-foreground">
                  Cartões arquivados somem da listagem padrão.
                </span>
              </div>
              <Controller
                control={editForm.control}
                name="is_archived"
                render={({ field }) => (
                  <Checkbox
                    id="cc-edit-archived"
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                )}
              />
            </div>

            {!isAdditionalEdit && !isDebitEdit ? <InfoNote /> : null}

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
              <Label className={labelClass}>Tipo do cartão</Label>
              <Controller
                control={createForm.control}
                name="card_type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">
                        <span className="inline-flex items-center gap-2">
                          <CreditCard className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
                          <span className="font-medium">Crédito</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            · limite + fatura
                          </span>
                        </span>
                      </SelectItem>
                      <SelectItem value="debit">
                        <span className="inline-flex items-center gap-2">
                          <Wallet className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
                          <span className="font-medium">Débito</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            · debita conta direto
                          </span>
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {isDebitCreate ? <DebitInfoBanner /> : null}

            <div className="space-y-2">
              <Label htmlFor="cc-create-name" className={labelClass}>Nome</Label>
              <Input
                id="cc-create-name"
                placeholder={isDebitCreate ? 'Ex: Cartão Itaú Débito' : 'Ex: Itaú Platinum'}
                className={inputClass}
                {...createForm.register('name')}
              />
              {createForm.formState.errors.name ? (
                <p className="text-sm text-destructive">
                  {createForm.formState.errors.name.message}
                </p>
              ) : null}
            </div>

            {!isDebitCreate ? (
              <div className="space-y-2">
                <Label className={labelClass}>Cartão principal (opcional)</Label>
                <Controller
                  control={createForm.control}
                  name="parent_card_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className={inputClass}>
                        <SelectValue placeholder="Nenhum — este é um cartão principal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_PARENT}>
                          Nenhum — este é um cartão principal
                        </SelectItem>
                        {eligibleParents.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            <span className="font-medium">{c.name}</span>
                            <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                              · {c.currency_code}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Cartões adicionais compartilham limite, fatura e datas com o principal.
                </p>
              </div>
            ) : null}

            {isAdditionalCreate ? (
              <AdditionalInheritNote parentName={selectedParent?.name} />
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className={labelClass}>Moeda</Label>
                <Controller
                  control={createForm.control}
                  name="currency_code"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v)
                        createForm.setValue('payment_account_id', NONE_ACCOUNT)
                      }}
                      disabled={isAdditionalCreate}
                    >
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
                {isAdditionalCreate ? (
                  <p className="text-[10px] text-muted-foreground">
                    Travada na moeda do principal.
                  </p>
                ) : isDebitCreate ? (
                  <p className="text-[10px] text-muted-foreground">
                    Deve coincidir com a moeda da conta vinculada.
                  </p>
                ) : null}
              </div>

              {!isAdditionalCreate && !isDebitCreate ? (
                <div className="space-y-2">
                  <Label htmlFor="cc-create-limit" className={labelClass}>Limite</Label>
                  <Input
                    id="cc-create-limit"
                    type="text"
                    inputMode="decimal"
                    placeholder="Sem limite"
                    className={cn(inputClass, 'font-mono tabular-nums')}
                    {...createForm.register('limit_amount')}
                  />
                  {createForm.formState.errors.limit_amount ? (
                    <p className="text-sm text-destructive">
                      {createForm.formState.errors.limit_amount.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {isDebitCreate ? (
              <div className="space-y-2">
                <Label className={labelClass}>Conta vinculada</Label>
                <Controller
                  control={createForm.control}
                  name="payment_account_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className={inputClass}>
                        <SelectValue placeholder="Selecione a conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleAccounts.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            Nenhuma conta com moeda {watchedCurrency}.
                          </div>
                        ) : (
                          eligibleAccounts.map((a) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
                {createForm.formState.errors.payment_account_id ? (
                  <p className="text-sm text-destructive">
                    {createForm.formState.errors.payment_account_id.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Contas com a mesma moeda do cartão ({watchedCurrency}).
                  </p>
                )}
              </div>
            ) : null}

            {!isAdditionalCreate && !isDebitCreate ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <DayField
                    id="cc-create-closing"
                    label="Dia de fechamento"
                    error={createForm.formState.errors.closing_day?.message}
                    {...createForm.register('closing_day', dayRegisterOptions)}
                  />
                  <DayField
                    id="cc-create-due"
                    label="Dia de vencimento"
                    error={createForm.formState.errors.due_day?.message}
                    {...createForm.register('due_day', dayRegisterOptions)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className={labelClass}>Conta de pagamento (opcional)</Label>
                  <Controller
                    control={createForm.control}
                    name="payment_account_id"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className={inputClass}>
                          <SelectValue placeholder="Nenhuma conta vinculada" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_ACCOUNT}>
                            Nenhuma conta vinculada
                          </SelectItem>
                          {eligibleAccounts.map((a) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Lista apenas contas com a mesma moeda do cartão ({watchedCurrency}).
                  </p>
                </div>
              </>
            ) : null}

            {!isAdditionalCreate && !isDebitCreate ? <InfoNote /> : null}

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

type DayFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  error?: string
}

const DayField = ({ id, label, error, ...rest }: DayFieldProps) => (
  <div className="space-y-2">
    <Label htmlFor={id} className={labelClass}>
      {label}
    </Label>
    <Input
      id={id}
      type="number"
      min={1}
      max={31}
      step={1}
      className={cn(inputClass, 'font-mono tabular-nums')}
      {...rest}
    />
    {error ? <p className="text-sm text-destructive">{error}</p> : null}
  </div>
)

function InfoNote() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span>
        Compras feitas até o dia de fechamento entram na fatura desse mês; depois
        disso vão para a próxima.
      </span>
    </div>
  )
}

function DebitInfoBanner() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs text-foreground">
      <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span>
        Débito vincula direto a uma conta. Cada compra debita o saldo dessa conta.
      </span>
    </div>
  )
}

function AdditionalInheritNote({ parentName }: { parentName?: string | null }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs text-foreground">
      <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span>
        Limite, datas e conta de pagamento serão herdados
        {parentName ? (
          <>
            {' '}de{' '}
            <strong className="font-medium">{parentName}</strong>
          </>
        ) : (
          ' do cartão principal'
        )}
        . As compras entram na fatura do principal.
      </span>
    </div>
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
