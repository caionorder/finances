import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building2, Landmark, Receipt } from 'lucide-react'
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
import { issuerApi, type IssuerProfileUpsert } from '@/lib/api/issuer'
import { accountsApi } from '@/lib/api/accounts'
import { extractError } from '@/features/invoices/utils'

const LABEL = 'text-xs font-medium uppercase tracking-wider text-muted-foreground'
const INPUT =
  'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'
const NO_ACCOUNT = '__none__'
const NO_CATEGORY = '__none__'

const DEFAULT_TAX_NOTE =
  'Beneficiary is a non-U.S. person. IRS Form W-8BEN (foreign status certification) on file — available upon request.'

const swiftRegex = /^[A-Z0-9]{8}([A-Z0-9]{3})?$/

const schema = z.object({
  legal_name: z.string().trim().min(1, 'Obrigatório').max(255),
  ruc: z.string().trim().min(1, 'Obrigatório').max(20),
  address_line1: z.string().trim().min(1, 'Obrigatório').max(255),
  address_line2: z.string().max(255).optional(),
  city: z.string().trim().min(1, 'Obrigatório').max(120),
  country: z.string().trim().min(2).max(2),
  email: z.union([z.string().email('E-mail inválido'), z.literal('')]).optional(),
  phone: z.string().max(50).optional(),
  bank_name: z.string().trim().min(1, 'Obrigatório').max(255),
  bank_address: z.string().max(500).optional(),
  bank_country: z.string().trim().min(2).max(2),
  swift_bic: z
    .string()
    .trim()
    .min(1, 'Obrigatório')
    .refine((v) => swiftRegex.test(v.toUpperCase()), 'SWIFT/BIC inválido'),
  account_number: z.string().max(64).optional(),
  iban: z.string().max(64).optional(),
  intermediary_bank_name: z.string().max(255).optional(),
  intermediary_swift_bic: z
    .union([
      z.literal(''),
      z.string().refine((v) => swiftRegex.test(v.toUpperCase()), 'SWIFT/BIC inválido'),
    ])
    .optional(),
  intermediary_account_number: z.string().max(64).optional(),
  intermediary_bank_country: z.string().max(2).optional(),
  receiving_account_id: z.string(),
  bank_receiving_fee: z
    .string()
    .trim()
    .regex(/^\d+([.,]\d+)?$/, 'Valor inválido'),
  default_income_category_id: z.string(),
  wire_reference_instructions: z.string().max(1000).optional(),
  default_payment_terms_days: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Informe um número de dias')
    .refine((v) => Number(v) >= 0 && Number(v) <= 365, 'Entre 0 e 365'),
  tax_status_note: z.string().max(1000).optional(),
})

type FormValues = z.infer<typeof schema>

export function IssuerSection() {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const issuerQuery = useQuery({
    queryKey: ['settings', 'issuer'],
    queryFn: () => issuerApi.get(),
  })

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: false }],
    queryFn: () => accountsApi.list(false),
  })

  const usdAccounts = (accountsQuery.data ?? []).filter(
    (a) => !a.is_archived && a.currency_code === 'USD'
  )

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      legal_name: '',
      ruc: '',
      address_line1: '',
      address_line2: '',
      city: '',
      country: 'PY',
      email: '',
      phone: '',
      bank_name: '',
      bank_address: '',
      bank_country: 'PY',
      swift_bic: '',
      account_number: '',
      iban: '',
      intermediary_bank_name: '',
      intermediary_swift_bic: '',
      intermediary_account_number: '',
      intermediary_bank_country: 'US',
      receiving_account_id: NO_ACCOUNT,
      bank_receiving_fee: '44',
      default_income_category_id: NO_CATEGORY,
      wire_reference_instructions: '',
      default_payment_terms_days: '30',
      tax_status_note: DEFAULT_TAX_NOTE,
    },
  })

  useEffect(() => {
    const data = issuerQuery.data
    if (!data) return
    form.reset({
      legal_name: data.legal_name,
      ruc: data.ruc,
      address_line1: data.address_line1,
      address_line2: data.address_line2 ?? '',
      city: data.city,
      country: data.country || 'PY',
      email: data.email ?? '',
      phone: data.phone ?? '',
      bank_name: data.bank_name,
      bank_address: data.bank_address ?? '',
      bank_country: data.bank_country || 'PY',
      swift_bic: data.swift_bic,
      account_number: data.account_number ?? '',
      iban: data.iban ?? '',
      intermediary_bank_name: data.intermediary_bank_name ?? '',
      intermediary_swift_bic: data.intermediary_swift_bic ?? '',
      intermediary_account_number: data.intermediary_account_number ?? '',
      intermediary_bank_country: data.intermediary_bank_country ?? 'US',
      receiving_account_id: data.receiving_account_id
        ? String(data.receiving_account_id)
        : NO_ACCOUNT,
      bank_receiving_fee: data.bank_receiving_fee ?? '44',
      default_income_category_id: data.default_income_category_id
        ? String(data.default_income_category_id)
        : NO_CATEGORY,
      wire_reference_instructions: data.wire_reference_instructions ?? '',
      default_payment_terms_days: String(data.default_payment_terms_days ?? 30),
      tax_status_note: data.tax_status_note ?? DEFAULT_TAX_NOTE,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuerQuery.data])

  const saveMutation = useMutation({
    mutationFn: (payload: IssuerProfileUpsert) => issuerApi.upsert(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'issuer'] })
      toast.success('Emissor salvo')
    },
    onError: (err) =>
      setServerError(extractError(err, 'Não foi possível salvar.')),
  })

  function handleSubmit(values: FormValues) {
    setServerError(null)
    saveMutation.mutate({
      legal_name: values.legal_name,
      ruc: values.ruc,
      address_line1: values.address_line1,
      address_line2: values.address_line2 || null,
      city: values.city,
      country: values.country.toUpperCase(),
      email: values.email || null,
      phone: values.phone || null,
      bank_name: values.bank_name,
      bank_address: values.bank_address || null,
      bank_country: values.bank_country.toUpperCase(),
      swift_bic: values.swift_bic.toUpperCase(),
      account_number: values.account_number || null,
      iban: values.iban || null,
      intermediary_bank_name: values.intermediary_bank_name || null,
      intermediary_swift_bic: values.intermediary_swift_bic
        ? values.intermediary_swift_bic.toUpperCase()
        : null,
      intermediary_account_number: values.intermediary_account_number || null,
      intermediary_bank_country: values.intermediary_bank_country
        ? values.intermediary_bank_country.toUpperCase()
        : null,
      receiving_account_id:
        values.receiving_account_id === NO_ACCOUNT
          ? null
          : Number(values.receiving_account_id),
      bank_receiving_fee: values.bank_receiving_fee.replace(',', '.'),
      default_income_category_id:
        values.default_income_category_id === NO_CATEGORY
          ? null
          : Number(values.default_income_category_id),
      wire_reference_instructions: values.wire_reference_instructions || null,
      default_payment_terms_days: Number(values.default_payment_terms_days),
      tax_status_note: values.tax_status_note || null,
    })
  }

  if (issuerQuery.isLoading) {
    return <div className="h-96 animate-pulse rounded-xl bg-muted/30" />
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" noValidate>
      {/* Company */}
      <Card icon={Building2} eyebrow="Entidade" title="Empresa emissora">
        <Field label="Razão social" error={form.formState.errors.legal_name?.message}>
          <Input className={INPUT} {...form.register('legal_name')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="RUC" error={form.formState.errors.ruc?.message}>
            <Input className={`${INPUT} font-mono`} {...form.register('ruc')} />
          </Field>
          <Field label="País" error={form.formState.errors.country?.message}>
            <Input
              className={`${INPUT} font-mono uppercase`}
              maxLength={2}
              {...form.register('country')}
            />
          </Field>
        </div>
        <Field label="Endereço (linha 1)" error={form.formState.errors.address_line1?.message}>
          <Input className={INPUT} {...form.register('address_line1')} />
        </Field>
        <Field label="Endereço (linha 2)">
          <Input className={INPUT} {...form.register('address_line2')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Cidade" error={form.formState.errors.city?.message}>
            <Input className={INPUT} {...form.register('city')} />
          </Field>
          <Field label="E-mail" error={form.formState.errors.email?.message}>
            <Input className={INPUT} type="email" {...form.register('email')} />
          </Field>
          <Field label="Telefone">
            <Input className={INPUT} {...form.register('phone')} />
          </Field>
        </div>
      </Card>

      {/* Beneficiary bank */}
      <Card icon={Landmark} eyebrow="Banco beneficiário (Continental)" title="Instruções de wire">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome do banco" error={form.formState.errors.bank_name?.message}>
            <Input className={INPUT} {...form.register('bank_name')} />
          </Field>
          <Field label="País do banco" error={form.formState.errors.bank_country?.message}>
            <Input
              className={`${INPUT} font-mono uppercase`}
              maxLength={2}
              {...form.register('bank_country')}
            />
          </Field>
        </div>
        <Field label="Endereço do banco">
          <Input className={INPUT} {...form.register('bank_address')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="SWIFT / BIC" error={form.formState.errors.swift_bic?.message}>
            <Input
              className={`${INPUT} font-mono uppercase`}
              {...form.register('swift_bic')}
            />
          </Field>
          <Field label="Nº da conta">
            <Input className={`${INPUT} font-mono`} {...form.register('account_number')} />
          </Field>
          <Field label="IBAN">
            <Input className={`${INPUT} font-mono`} {...form.register('iban')} />
          </Field>
        </div>
      </Card>

      {/* Intermediary bank */}
      <Card icon={Landmark} eyebrow="Banco intermediário (EUA)" title="Correspondente (opcional)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome do banco">
            <Input className={INPUT} {...form.register('intermediary_bank_name')} />
          </Field>
          <Field label="País" >
            <Input
              className={`${INPUT} font-mono uppercase`}
              maxLength={2}
              {...form.register('intermediary_bank_country')}
            />
          </Field>
          <Field
            label="SWIFT / BIC"
            error={form.formState.errors.intermediary_swift_bic?.message}
          >
            <Input
              className={`${INPUT} font-mono uppercase`}
              {...form.register('intermediary_swift_bic')}
            />
          </Field>
          <Field label="Conta no correspondente">
            <Input
              className={`${INPUT} font-mono`}
              {...form.register('intermediary_account_number')}
            />
          </Field>
        </div>
      </Card>

      {/* Reconciliation config */}
      <Card icon={Receipt} eyebrow="Recebimento & ledger" title="Conciliação">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Conta de recebimento (USD)"
            error={form.formState.errors.receiving_account_id?.message}
          >
            <Controller
              control={form.control}
              name="receiving_account_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className={INPUT}>
                    <SelectValue placeholder="Selecione a conta Continental" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ACCOUNT}>Não configurada</SelectItem>
                    {usdAccounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name} ({a.currency_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field
            label="Taxa do banco (USD)"
            error={form.formState.errors.bank_receiving_fee?.message}
          >
            <Input
              className={`${INPUT} font-mono tabular-nums`}
              inputMode="decimal"
              {...form.register('bank_receiving_fee')}
            />
          </Field>
          <Field label="Categoria de receita padrão">
            <Controller
              control={form.control}
              name="default_income_category_id"
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
          </Field>
          <Field
            label="Prazo padrão (dias)"
            error={form.formState.errors.default_payment_terms_days?.message}
          >
            <Input
              className={`${INPUT} font-mono tabular-nums`}
              inputMode="numeric"
              {...form.register('default_payment_terms_days')}
            />
          </Field>
        </div>
        <Field label="Instruções adicionais de wire (referência)">
          <Textarea
            rows={2}
            className="border-border/80 bg-background/50 transition-colors focus:border-primary"
            {...form.register('wire_reference_instructions')}
          />
        </Field>
        <Field label="Nota de status fiscal (W-8BEN)">
          <Textarea
            rows={2}
            className="border-border/80 bg-background/50 transition-colors focus:border-primary"
            {...form.register('tax_status_note')}
          />
        </Field>
      </Card>

      {serverError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saveMutation.isPending}
          className="shadow-[0_0_24px_-8px_var(--color-primary)]"
        >
          {saveMutation.isPending ? 'Salvando...' : 'Salvar emissor'}
        </Button>
      </div>
    </form>
  )
}

function Card({
  icon: Icon,
  eyebrow,
  title,
  children,
}: {
  icon: typeof Building2
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card shadow-soft">
      <div className="flex items-center gap-2 border-b border-border/40 p-5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/40 ring-1 ring-border">
          <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </div>
          <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        </div>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label className={LABEL}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
