import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import {
  customersApi,
  type CustomerCreate,
  type CustomerOut,
  type CustomerUpdate,
} from '@/lib/api/customers'
import { extractError } from '@/features/invoices/utils'

const LABEL = 'text-xs font-medium uppercase tracking-wider text-muted-foreground'
const INPUT =
  'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'

const schema = z.object({
  legal_name: z.string().trim().min(1, 'Informe a razão social').max(255),
  contact_person: z.string().max(255).optional(),
  email: z.union([z.string().email('E-mail inválido'), z.literal('')]).optional(),
  phone: z.string().max(50).optional(),
  tax_id: z.string().max(50).optional(),
  billing_address_line1: z.string().trim().min(1, 'Informe o endereço').max(255),
  billing_address_line2: z.string().max(255).optional(),
  billing_city: z.string().trim().min(1, 'Informe a cidade').max(120),
  billing_state: z.string().max(120).optional(),
  billing_postal_code: z.string().max(20).optional(),
  billing_country: z.string().trim().min(2).max(2),
  notes: z.string().max(1000).optional(),
})

type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = {
  legal_name: '',
  contact_person: '',
  email: '',
  phone: '',
  tax_id: '',
  billing_address_line1: '',
  billing_address_line2: '',
  billing_city: '',
  billing_state: '',
  billing_postal_code: '',
  billing_country: 'US',
  notes: '',
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: CustomerOut | null
}

export function CustomerFormDialog({ open, onOpenChange, customer }: Props) {
  const isEdit = Boolean(customer)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  })

  function handleOpenChange(next: boolean) {
    if (!next) setServerError(null)
    onOpenChange(next)
  }

  useEffect(() => {
    if (!open) return
    if (isEdit && customer) {
      form.reset({
        legal_name: customer.legal_name,
        contact_person: customer.contact_person ?? '',
        email: customer.email ?? '',
        phone: customer.phone ?? '',
        tax_id: customer.tax_id ?? '',
        billing_address_line1: customer.billing_address_line1,
        billing_address_line2: customer.billing_address_line2 ?? '',
        billing_city: customer.billing_city,
        billing_state: customer.billing_state ?? '',
        billing_postal_code: customer.billing_postal_code ?? '',
        billing_country: customer.billing_country || 'US',
        notes: customer.notes ?? '',
      })
    } else {
      form.reset(EMPTY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, customer])

  const createMutation = useMutation({
    mutationFn: (payload: CustomerCreate) => customersApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Cliente criado')
      onOpenChange(false)
    },
    onError: (err) =>
      setServerError(extractError(err, 'Não foi possível criar o cliente.')),
  })

  const updateMutation = useMutation({
    mutationFn: (payload: CustomerUpdate) =>
      customersApi.update(customer!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Cliente atualizado')
      onOpenChange(false)
    },
    onError: (err) =>
      setServerError(extractError(err, 'Não foi possível atualizar.')),
  })

  function handleSubmit(values: FormValues) {
    setServerError(null)
    const payload = {
      legal_name: values.legal_name,
      contact_person: values.contact_person || null,
      email: values.email || null,
      phone: values.phone || null,
      tax_id: values.tax_id || null,
      billing_address_line1: values.billing_address_line1,
      billing_address_line2: values.billing_address_line2 || null,
      billing_city: values.billing_city,
      billing_state: values.billing_state || null,
      billing_postal_code: values.billing_postal_code || null,
      billing_country: values.billing_country.toUpperCase(),
      notes: values.notes || null,
    }
    if (isEdit) updateMutation.mutate(payload)
    else createMutation.mutate(payload)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-border/60 bg-card backdrop-blur-xl sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {isEdit ? 'Editar cliente' : 'Novo cliente'}
          </DialogTitle>
          <DialogDescription>
            Dados de cobrança usados nas invoices comerciais (EUA).
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-4"
          noValidate
        >
          <Field label="Razão social" error={form.formState.errors.legal_name?.message}>
            <Input className={INPUT} {...form.register('legal_name')} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contato">
              <Input className={INPUT} {...form.register('contact_person')} />
            </Field>
            <Field label="E-mail" error={form.formState.errors.email?.message}>
              <Input className={INPUT} type="email" {...form.register('email')} />
            </Field>
            <Field label="Telefone">
              <Input className={INPUT} {...form.register('phone')} />
            </Field>
            <Field label="EIN / Tax ID">
              <Input className={`${INPUT} font-mono`} {...form.register('tax_id')} />
            </Field>
          </div>

          <Field
            label="Endereço (linha 1)"
            error={form.formState.errors.billing_address_line1?.message}
          >
            <Input className={INPUT} {...form.register('billing_address_line1')} />
          </Field>
          <Field label="Endereço (linha 2)">
            <Input className={INPUT} {...form.register('billing_address_line2')} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Cidade" error={form.formState.errors.billing_city?.message}>
              <Input className={INPUT} {...form.register('billing_city')} />
            </Field>
            <Field label="Estado">
              <Input className={INPUT} {...form.register('billing_state')} />
            </Field>
            <Field label="CEP / ZIP">
              <Input className={`${INPUT} font-mono`} {...form.register('billing_postal_code')} />
            </Field>
            <Field label="País" error={form.formState.errors.billing_country?.message}>
              <Input
                className={`${INPUT} font-mono uppercase`}
                maxLength={2}
                {...form.register('billing_country')}
              />
            </Field>
          </div>

          <Field label="Notas">
            <Textarea
              rows={2}
              className="border-border/80 bg-background/50 transition-colors focus:border-primary"
              {...form.register('notes')}
            />
          </Field>

          {serverError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {serverError}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="shadow-[0_0_24px_-8px_var(--color-primary)]"
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
