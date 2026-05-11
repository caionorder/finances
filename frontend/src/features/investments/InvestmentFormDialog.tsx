import { useEffect, useMemo, useState } from 'react'
import {
  useForm,
  Controller,
  type Control,
  type FieldValues,
  type UseFormRegister,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Info } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
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
import { KNOWN_CURRENCIES } from '@/lib/api/currencies'
import {
  investmentsApi,
  type IndexRef,
  type InvestmentCreate,
  type InvestmentType,
  type InvestmentUpdate,
  type InvestmentWithPosition,
  type Liquidity,
  type RateKind,
  type RatePeriod,
} from '@/lib/api/investments'
import { cn } from '@/lib/utils'
import {
  INDEX_REF_LABEL,
  INVESTMENT_TYPES,
  LIQUIDITY_LABEL,
  normalizeDecimal,
  RATE_KIND_LABEL,
  RATE_PERIOD_LABEL,
  todayISO,
} from './shared'

const CURRENCIES = ['BRL', 'USD', 'PYG', 'BTC', 'USDT'] as const
const FIAT_CURRENCIES = KNOWN_CURRENCIES.filter((c) => !c.is_crypto)
const CRYPTO_CURRENCIES = KNOWN_CURRENCIES.filter((c) => c.is_crypto)
const NONE_ACCOUNT = '__none__'

const decimalString = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d+)?$/, 'Informe um valor numérico válido')
  .refine(
    (v) => parseFloat(v.replace(',', '.')) > 0,
    'Valor deve ser maior que zero'
  )

const rateValue = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d+)?$/, 'Informe uma taxa numérica válida')

const createSchema = z
  .object({
    name: z.string().min(1, 'Informe o nome'),
    type: z.enum([
      'cdb',
      'lci',
      'lca',
      'tesouro',
      'poupanca',
      'fundo',
      'acoes',
      'cripto',
      'outros',
    ]),
    account_id: z.string().optional(),
    currency_code: z.enum(CURRENCIES),
    principal: decimalString,
    start_date: z.string().min(1, 'Informe a data inicial'),
    maturity_date: z.string().optional(),
    rate_value: rateValue,
    rate_period: z.enum(['monthly', 'semiannual', 'annual']),
    rate_kind: z.enum(['fixed', 'percent_of_index', 'index_plus']),
    index_ref: z.enum(['cdi', 'selic', 'ipca', 'igpm']).optional(),
    liquidity: z.enum(['daily', 'on_maturity']),
    notes: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
  })
  .refine(
    (d) => d.rate_kind === 'fixed' || Boolean(d.index_ref),
    {
      message: 'Selecione o indexador',
      path: ['index_ref'],
    }
  )

const editSchema = z.object({
  name: z.string().min(1, 'Informe o nome'),
  type: z.enum([
    'cdb',
    'lci',
    'lca',
    'tesouro',
    'poupanca',
    'fundo',
    'acoes',
    'cripto',
    'outros',
  ]),
  account_id: z.string().optional(),
  maturity_date: z.string().optional(),
  rate_value: rateValue,
  rate_period: z.enum(['monthly', 'semiannual', 'annual']),
  rate_kind: z.enum(['fixed', 'percent_of_index', 'index_plus']),
  index_ref: z.enum(['cdi', 'selic', 'ipca', 'igpm']).optional(),
  liquidity: z.enum(['daily', 'on_maturity']),
  notes: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
  is_archived: z.boolean(),
})

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  investment?: InvestmentWithPosition | null
}

const labelClass =
  'text-[11px] font-medium uppercase tracking-wider text-muted-foreground'
const inputClass =
  'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'
const submitClass =
  'shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]'

export function InvestmentFormDialog({ open, onOpenChange, investment }: Props) {
  const isEdit = Boolean(investment)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: false }],
    queryFn: () => accountsApi.list(false),
    enabled: open,
  })

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: '',
      type: 'cdb',
      account_id: NONE_ACCOUNT,
      currency_code: 'BRL',
      principal: '',
      start_date: todayISO(),
      maturity_date: '',
      rate_value: '',
      rate_period: 'annual',
      rate_kind: 'fixed',
      index_ref: undefined,
      liquidity: 'daily',
      notes: '',
    },
  })

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: '',
      type: 'cdb',
      account_id: NONE_ACCOUNT,
      maturity_date: '',
      rate_value: '',
      rate_period: 'annual',
      rate_kind: 'fixed',
      index_ref: undefined,
      liquidity: 'daily',
      notes: '',
      is_archived: false,
    },
  })

  const watchedCurrency = createForm.watch('currency_code')
  const watchedRateKindCreate = createForm.watch('rate_kind')
  const watchedRateValueCreate = createForm.watch('rate_value')
  const watchedIndexRefCreate = createForm.watch('index_ref')
  const watchedRatePeriodCreate = createForm.watch('rate_period')

  const watchedRateKindEdit = editForm.watch('rate_kind')
  const watchedRateValueEdit = editForm.watch('rate_value')
  const watchedIndexRefEdit = editForm.watch('index_ref')
  const watchedRatePeriodEdit = editForm.watch('rate_period')

  useEffect(() => {
    if (!open) {
      setServerError(null)
      return
    }
    if (isEdit && investment) {
      editForm.reset({
        name: investment.name,
        type: investment.type,
        account_id: investment.account_id
          ? String(investment.account_id)
          : NONE_ACCOUNT,
        maturity_date: investment.maturity_date ?? '',
        rate_value: investment.rate_value,
        rate_period: investment.rate_period,
        rate_kind: investment.rate_kind,
        index_ref: investment.index_ref ?? undefined,
        liquidity: investment.liquidity,
        notes: investment.notes ?? '',
        is_archived: investment.is_archived,
      })
    } else {
      createForm.reset({
        name: '',
        type: 'cdb',
        account_id: NONE_ACCOUNT,
        currency_code: 'BRL',
        principal: '',
        start_date: todayISO(),
        maturity_date: '',
        rate_value: '',
        rate_period: 'annual',
        rate_kind: 'fixed',
        index_ref: undefined,
        liquidity: 'daily',
        notes: '',
      })
    }
  }, [open, isEdit, investment, createForm, editForm])

  const eligibleAccounts = useMemo(() => {
    const targetCurrency = isEdit ? investment?.currency_code : watchedCurrency
    if (!targetCurrency) return []
    return (accountsQuery.data ?? [])
      .filter((a) => !a.is_archived && a.currency_code === targetCurrency)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [accountsQuery.data, isEdit, investment?.currency_code, watchedCurrency])

  const createMutation = useMutation({
    mutationFn: (payload: InvestmentCreate) => investmentsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] })
      toast.success('Investimento criado')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(
        extractError(err, 'Não foi possível criar o investimento.')
      )
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: InvestmentUpdate) =>
      investmentsApi.update(investment!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] })
      queryClient.invalidateQueries({ queryKey: ['investment', investment!.id] })
      toast.success('Investimento atualizado')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(
        extractError(err, 'Não foi possível atualizar o investimento.')
      )
    },
  })

  function handleCreate(values: CreateValues) {
    setServerError(null)
    const payload: InvestmentCreate = {
      name: values.name,
      type: values.type as InvestmentType,
      currency_code: values.currency_code,
      principal: normalizeDecimal(values.principal),
      start_date: values.start_date,
      rate_value: normalizeDecimal(values.rate_value),
      rate_period: values.rate_period as RatePeriod,
      rate_kind: values.rate_kind as RateKind,
      liquidity: values.liquidity as Liquidity,
    }
    if (values.account_id && values.account_id !== NONE_ACCOUNT) {
      payload.account_id = Number(values.account_id)
    } else {
      payload.account_id = null
    }
    if (values.maturity_date) payload.maturity_date = values.maturity_date
    if (values.rate_kind !== 'fixed' && values.index_ref) {
      payload.index_ref = values.index_ref as IndexRef
    }
    if (values.notes?.trim()) payload.notes = values.notes.trim()
    createMutation.mutate(payload)
  }

  function handleEdit(values: EditValues) {
    setServerError(null)
    const payload: InvestmentUpdate = {
      name: values.name,
      type: values.type as InvestmentType,
      maturity_date: values.maturity_date || null,
      rate_value: normalizeDecimal(values.rate_value),
      rate_period: values.rate_period as RatePeriod,
      rate_kind: values.rate_kind as RateKind,
      liquidity: values.liquidity as Liquidity,
      is_archived: values.is_archived,
      account_id:
        values.account_id && values.account_id !== NONE_ACCOUNT
          ? Number(values.account_id)
          : null,
      index_ref:
        values.rate_kind !== 'fixed' && values.index_ref
          ? (values.index_ref as IndexRef)
          : null,
      notes: values.notes?.trim() ? values.notes.trim() : null,
    }
    updateMutation.mutate(payload)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {isEdit ? 'Editar investimento' : 'Novo investimento'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize as informações do ativo. Moeda, valor inicial e data de início não podem ser alterados.'
              : 'Cadastre um ativo informando tipo, taxa, liquidez e demais parâmetros.'}
          </DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <form
            onSubmit={editForm.handleSubmit(handleEdit)}
            className="space-y-4"
            noValidate
          >
            <NameTypeRow
              register={editForm.register('name')}
              nameError={editForm.formState.errors.name?.message}
              typeController={
                <Controller
                  control={editForm.control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className={inputClass}>
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {INVESTMENT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              }
            />

            <DisabledRow
              currency={investment?.currency_code ?? ''}
              principal={investment?.principal ?? ''}
              startDate={investment?.start_date ?? ''}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="inv-edit-maturity" className={labelClass}>
                  Vencimento (opcional)
                </Label>
                <Input
                  id="inv-edit-maturity"
                  type="date"
                  className={cn(inputClass, 'font-mono')}
                  {...editForm.register('maturity_date')}
                />
              </div>
              <AccountField
                control={editForm.control as unknown as Control<FieldValues>}
                disabledCurrency={investment?.currency_code}
                accounts={eligibleAccounts}
              />
            </div>

            <RateBlock
              prefix="edit"
              register={editForm.register as unknown as UseFormRegister<FieldValues>}
              control={editForm.control as unknown as Control<FieldValues>}
              rateValueError={editForm.formState.errors.rate_value?.message}
              indexRefError={editForm.formState.errors.index_ref?.message}
              rateKind={watchedRateKindEdit as RateKind}
              rateValue={watchedRateValueEdit}
              indexRef={watchedIndexRefEdit as IndexRef | undefined}
              ratePeriod={watchedRatePeriodEdit as RatePeriod}
            />

            <div className="space-y-2">
              <Label className={labelClass}>Liquidez</Label>
              <Controller
                control={editForm.control}
                name="liquidity"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder="Liquidez" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">
                        {LIQUIDITY_LABEL.daily}
                      </SelectItem>
                      <SelectItem value="on_maturity">
                        {LIQUIDITY_LABEL.on_maturity}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inv-edit-notes" className={labelClass}>
                Notas
              </Label>
              <Textarea
                id="inv-edit-notes"
                placeholder="Observações sobre o investimento"
                className="border-border/80 bg-background/50"
                {...editForm.register('notes')}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
              <div className="flex flex-col">
                <Label
                  htmlFor="inv-edit-archived"
                  className="cursor-pointer text-sm font-medium"
                >
                  Arquivado
                </Label>
                <span className="text-xs text-muted-foreground">
                  Investimentos arquivados somem da listagem padrão.
                </span>
              </div>
              <Controller
                control={editForm.control}
                name="is_archived"
                render={({ field }) => (
                  <Checkbox
                    id="inv-edit-archived"
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className={submitClass}
              >
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
            <NameTypeRow
              register={createForm.register('name')}
              nameError={createForm.formState.errors.name?.message}
              typeController={
                <Controller
                  control={createForm.control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className={inputClass}>
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {INVESTMENT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              }
            />

            <div className="grid grid-cols-3 gap-3">
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
                        createForm.setValue('account_id', NONE_ACCOUNT)
                      }}
                    >
                      <SelectTrigger className={cn(inputClass, 'font-mono')}>
                        <SelectValue />
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
              <div className="space-y-2">
                <Label htmlFor="inv-create-principal" className={labelClass}>
                  Valor inicial
                </Label>
                <Input
                  id="inv-create-principal"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  className={cn(inputClass, 'font-mono tabular-nums')}
                  {...createForm.register('principal')}
                />
                {createForm.formState.errors.principal ? (
                  <p className="text-sm text-destructive">
                    {createForm.formState.errors.principal.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-create-start" className={labelClass}>
                  Data inicial
                </Label>
                <Input
                  id="inv-create-start"
                  type="date"
                  className={cn(inputClass, 'font-mono')}
                  {...createForm.register('start_date')}
                />
                {createForm.formState.errors.start_date ? (
                  <p className="text-sm text-destructive">
                    {createForm.formState.errors.start_date.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="inv-create-maturity" className={labelClass}>
                  Vencimento (opcional)
                </Label>
                <Input
                  id="inv-create-maturity"
                  type="date"
                  className={cn(inputClass, 'font-mono')}
                  {...createForm.register('maturity_date')}
                />
              </div>
              <AccountField
                control={createForm.control as unknown as Control<FieldValues>}
                disabledCurrency={watchedCurrency}
                accounts={eligibleAccounts}
              />
            </div>

            <RateBlock
              prefix="create"
              register={createForm.register as unknown as UseFormRegister<FieldValues>}
              control={createForm.control as unknown as Control<FieldValues>}
              rateValueError={createForm.formState.errors.rate_value?.message}
              indexRefError={createForm.formState.errors.index_ref?.message}
              rateKind={watchedRateKindCreate as RateKind}
              rateValue={watchedRateValueCreate}
              indexRef={watchedIndexRefCreate as IndexRef | undefined}
              ratePeriod={watchedRatePeriodCreate as RatePeriod}
            />

            <div className="space-y-2">
              <Label className={labelClass}>Liquidez</Label>
              <Controller
                control={createForm.control}
                name="liquidity"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder="Liquidez" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">
                        {LIQUIDITY_LABEL.daily}
                      </SelectItem>
                      <SelectItem value="on_maturity">
                        {LIQUIDITY_LABEL.on_maturity}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inv-create-notes" className={labelClass}>
                Notas
              </Label>
              <Textarea
                id="inv-create-notes"
                placeholder="Observações sobre o investimento"
                className="border-border/80 bg-background/50"
                {...createForm.register('notes')}
              />
            </div>

            {serverError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
                disabled={createMutation.isPending}
                className={submitClass}
              >
                {createMutation.isPending ? 'Criando...' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function NameTypeRow({
  register,
  nameError,
  typeController,
}: {
  register: ReturnType<UseFormRegister<FieldValues>>
  nameError?: string
  typeController: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[1fr_180px] gap-3">
      <div className="space-y-2">
        <Label className={labelClass}>Nome</Label>
        <Input
          placeholder="Ex: CDB Banco Inter 120% CDI"
          className={inputClass}
          {...register}
        />
        {nameError ? (
          <p className="text-sm text-destructive">{nameError}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label className={labelClass}>Tipo</Label>
        {typeController}
      </div>
    </div>
  )
}

function DisabledRow({
  currency,
  principal,
  startDate,
}: {
  currency: string
  principal: string
  startDate: string
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="space-y-2">
        <Label className={labelClass}>Moeda</Label>
        <Input
          value={currency}
          disabled
          readOnly
          className="h-10 border-border/60 bg-muted/40 font-mono"
        />
      </div>
      <div className="space-y-2">
        <Label className={labelClass}>Valor inicial</Label>
        <Input
          value={principal}
          disabled
          readOnly
          className="h-10 border-border/60 bg-muted/40 font-mono tabular-nums"
        />
      </div>
      <div className="space-y-2">
        <Label className={labelClass}>Data inicial</Label>
        <Input
          value={startDate}
          disabled
          readOnly
          className="h-10 border-border/60 bg-muted/40 font-mono"
        />
      </div>
    </div>
  )
}

type AccountFieldProps = {
  control: Control<FieldValues>
  disabledCurrency: string | undefined
  accounts: { id: number; name: string }[]
}

function AccountField({ control, disabledCurrency, accounts }: AccountFieldProps) {
  return (
    <div className="space-y-2">
      <Label className={labelClass}>Conta vinculada (opcional)</Label>
      <Controller
        control={control}
        name="account_id"
        render={({ field }) => (
          <Select value={field.value as string} onValueChange={field.onChange}>
            <SelectTrigger className={inputClass}>
              <SelectValue placeholder="Sem conta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_ACCOUNT}>Sem conta</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {disabledCurrency ? (
        <p className="text-xs text-muted-foreground">
          Mostra contas em {disabledCurrency}.
        </p>
      ) : null}
    </div>
  )
}

type RateBlockProps = {
  prefix: 'create' | 'edit'
  register: UseFormRegister<FieldValues>
  control: Control<FieldValues>
  rateValueError?: string
  indexRefError?: string
  rateKind: RateKind
  rateValue: string
  indexRef: IndexRef | undefined
  ratePeriod: RatePeriod
}

function RateBlock({
  prefix,
  register,
  control,
  rateValueError,
  indexRefError,
  rateKind,
  rateValue,
  indexRef,
  ratePeriod,
}: RateBlockProps) {
  const indexLabel = indexRef ? INDEX_REF_LABEL[indexRef] : '—'
  const periodLabel = RATE_PERIOD_LABEL[ratePeriod].toLowerCase()
  let preview: string | null = null
  if (rateValue && /^\d+([.,]\d+)?$/.test(rateValue)) {
    if (rateKind === 'fixed') {
      preview = `Renderá ${rateValue}% ao ${periodLabel.replace('mensal', 'mês').replace('semestral', 'semestre').replace('anual', 'ano')} de forma fixa.`
    } else if (rateKind === 'percent_of_index') {
      preview = `Renderá ${rateValue}% do ${indexLabel} ao ${periodLabel.replace('mensal', 'mês').replace('semestral', 'semestre').replace('anual', 'ano')}.`
    } else {
      preview = `Renderá ${indexLabel} + ${rateValue}% ao ${periodLabel.replace('mensal', 'mês').replace('semestral', 'semestre').replace('anual', 'ano')}.`
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-primary">
        <Info className="h-3 w-3" />
        <span>Taxa</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor={`inv-${prefix}-rate`} className={labelClass}>
            Valor (%)
          </Label>
          <Input
            id={`inv-${prefix}-rate`}
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            className={cn(inputClass, 'font-mono tabular-nums')}
            {...register('rate_value')}
          />
          {rateValueError ? (
            <p className="text-sm text-destructive">{rateValueError}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label className={labelClass}>Período</Label>
          <Controller
            control={control}
            name="rate_period"
            render={({ field }) => (
              <Select
                value={field.value as string}
                onValueChange={field.onChange}
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">
                    {RATE_PERIOD_LABEL.monthly}
                  </SelectItem>
                  <SelectItem value="semiannual">
                    {RATE_PERIOD_LABEL.semiannual}
                  </SelectItem>
                  <SelectItem value="annual">
                    {RATE_PERIOD_LABEL.annual}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-2">
          <Label className={labelClass}>Tipo de taxa</Label>
          <Controller
            control={control}
            name="rate_kind"
            render={({ field }) => (
              <Select
                value={field.value as string}
                onValueChange={field.onChange}
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">{RATE_KIND_LABEL.fixed}</SelectItem>
                  <SelectItem value="percent_of_index">
                    {RATE_KIND_LABEL.percent_of_index}
                  </SelectItem>
                  <SelectItem value="index_plus">
                    {RATE_KIND_LABEL.index_plus}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {rateKind !== 'fixed' ? (
        <div className="space-y-2">
          <Label className={labelClass}>Indexador</Label>
          <Controller
            control={control}
            name="index_ref"
            render={({ field }) => (
              <Select
                value={(field.value as string) ?? ''}
                onValueChange={field.onChange}
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cdi">{INDEX_REF_LABEL.cdi}</SelectItem>
                  <SelectItem value="selic">
                    {INDEX_REF_LABEL.selic}
                  </SelectItem>
                  <SelectItem value="ipca">{INDEX_REF_LABEL.ipca}</SelectItem>
                  <SelectItem value="igpm">{INDEX_REF_LABEL.igpm}</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {indexRefError ? (
            <p className="text-sm text-destructive">{indexRefError}</p>
          ) : null}
        </div>
      ) : null}

      {preview ? (
        <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 font-mono text-xs text-primary">
          {preview}
        </p>
      ) : null}
    </div>
  )
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)
      ?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
