import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeftRight, Info } from 'lucide-react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { accountsApi } from '@/lib/api/accounts'
import {
  transactionsApi,
  type TransferCreate,
} from '@/lib/api/transactions'
import { cn } from '@/lib/utils'

const decimalString = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d+)?$/, 'Informe um valor positivo')
  .refine((v) => parseFloat(v.replace(',', '.')) > 0, {
    message: 'O valor deve ser maior que zero',
  })

const schema = z
  .object({
    source_account_id: z.string().min(1, 'Selecione a conta de origem'),
    destination_account_id: z.string().min(1, 'Selecione a conta de destino'),
    amount: decimalString,
    date: z.string().min(1, 'Informe a data'),
    description: z.string().max(500).optional(),
  })
  .refine((d) => d.source_account_id !== d.destination_account_id, {
    path: ['destination_account_id'],
    message: 'A conta de destino deve ser diferente da origem',
  })

type FormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const labelClass = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground'
const inputClass = 'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'

export function TransferFormDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: false }],
    queryFn: () => accountsApi.list(false),
    enabled: open,
  })

  const accounts = (accountsQuery.data ?? []).filter((a) => !a.is_archived)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      source_account_id: '',
      destination_account_id: '',
      amount: '',
      date: today(),
      description: '',
    },
  })

  useEffect(() => {
    if (!open) {
      setServerError(null)
      return
    }
    form.reset({
      source_account_id: '',
      destination_account_id: '',
      amount: '',
      date: today(),
      description: '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const sourceId = form.watch('source_account_id')

  const sourceAccount = useMemo(
    () => accounts.find((a) => String(a.id) === sourceId),
    [accounts, sourceId]
  )

  const compatibleDestinations = useMemo(() => {
    if (!sourceAccount) return []
    return accounts.filter(
      (a) => a.id !== sourceAccount.id && a.currency_code === sourceAccount.currency_code
    )
  }, [accounts, sourceAccount])

  const transferMutation = useMutation({
    mutationFn: (payload: TransferCreate) => transactionsApi.createTransfer(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Transferência registrada')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível registrar a transferência.'))
    },
  })

  function onSubmit(values: FormValues) {
    setServerError(null)
    const src = accounts.find((a) => String(a.id) === values.source_account_id)
    const dst = accounts.find((a) => String(a.id) === values.destination_account_id)
    if (src && dst && src.currency_code !== dst.currency_code) {
      setServerError('Transferências só podem ser feitas entre contas da mesma moeda.')
      return
    }
    transferMutation.mutate({
      source_account_id: Number(values.source_account_id),
      destination_account_id: Number(values.destination_account_id),
      amount: normalizeDecimal(values.amount),
      date: values.date,
      description: values.description || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
              <ArrowLeftRight className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Nova transferência
            </DialogTitle>
          </div>
          <DialogDescription>
            Movimente saldo entre duas contas suas. O sistema cria duas transações
            espelhadas (saída na origem, entrada no destino).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Transferências só podem ser feitas entre contas da{' '}
            <strong className="text-foreground">mesma moeda</strong>.
          </span>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label className={labelClass}>Conta de origem</Label>
            <Controller
              control={form.control}
              name="source_account_id"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v)
                    form.setValue('destination_account_id', '')
                  }}
                >
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
            {form.formState.errors.source_account_id ? (
              <p className="text-sm text-destructive">
                {form.formState.errors.source_account_id.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label className={labelClass}>Conta de destino</Label>
            <Controller
              control={form.control}
              name="destination_account_id"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={!sourceAccount}
                >
                  <SelectTrigger className={inputClass}>
                    <SelectValue
                      placeholder={
                        sourceAccount
                          ? 'Selecione a conta'
                          : 'Selecione primeiro a origem'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {compatibleDestinations.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name} ({a.currency_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {sourceAccount && compatibleDestinations.length === 0 ? (
              <p className="text-xs text-warning">
                Não há outras contas em {sourceAccount.currency_code} disponíveis.
              </p>
            ) : null}
            {form.formState.errors.destination_account_id ? (
              <p className="text-sm text-destructive">
                {form.formState.errors.destination_account_id.message}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tr-amount" className={labelClass}>
                Valor
              </Label>
              <Input
                id="tr-amount"
                inputMode="decimal"
                placeholder="0.00"
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
              <Label htmlFor="tr-date" className={labelClass}>
                Data
              </Label>
              <Input
                id="tr-date"
                type="date"
                className={cn(inputClass, 'font-mono')}
                {...form.register('date')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tr-desc" className={labelClass}>
              Descrição (opcional)
            </Label>
            <Textarea
              id="tr-desc"
              rows={2}
              className="border-border/80 bg-background/50 transition-colors focus:border-primary"
              {...form.register('description')}
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
            <Button
              type="submit"
              disabled={transferMutation.isPending}
              className="shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]"
            >
              {transferMutation.isPending ? 'Registrando...' : 'Registrar'}
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
