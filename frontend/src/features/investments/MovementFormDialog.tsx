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
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  investmentsApi,
  type MovementCreate,
  type MovementType,
} from '@/lib/api/investments'
import { cn } from '@/lib/utils'
import { normalizeDecimal, todayISO } from './shared'

const schema = z.object({
  type: z.enum(['deposit', 'withdrawal', 'interest']),
  amount: z
    .string()
    .trim()
    .regex(/^\d+([.,]\d+)?$/, 'Informe um valor numérico válido')
    .refine(
      (v) => parseFloat(v.replace(',', '.')) > 0,
      'Valor deve ser maior que zero'
    ),
  date: z.string().min(1, 'Informe a data'),
  notes: z.string().max(2000, 'Máximo 2000 caracteres').optional(),
})

type FormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  investmentId: number
  currencyCode: string
  initialType?: MovementType
}

const labelClass =
  'text-[11px] font-medium uppercase tracking-wider text-muted-foreground'
const inputClass =
  'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'
const submitClass =
  'shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]'

export function MovementFormDialog({
  open,
  onOpenChange,
  investmentId,
  currencyCode,
  initialType = 'deposit',
}: Props) {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: initialType,
      amount: '',
      date: todayISO(),
      notes: '',
    },
  })

  useEffect(() => {
    if (!open) {
      setServerError(null)
      return
    }
    form.reset({
      type: initialType,
      amount: '',
      date: todayISO(),
      notes: '',
    })
  }, [open, initialType, form])

  const createMutation = useMutation({
    mutationFn: (payload: MovementCreate) =>
      investmentsApi.createMovement(investmentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['investment-movements', investmentId],
      })
      queryClient.invalidateQueries({
        queryKey: ['investment-position', investmentId],
      })
      queryClient.invalidateQueries({ queryKey: ['investments'] })
      toast.success('Movimento registrado')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(
        extractError(err, 'Não foi possível registrar o movimento.')
      )
    },
  })

  function handleSubmit(values: FormValues) {
    setServerError(null)
    const payload: MovementCreate = {
      type: values.type as MovementType,
      amount: normalizeDecimal(values.amount),
      date: values.date,
    }
    if (values.notes?.trim()) payload.notes = values.notes.trim()
    createMutation.mutate(payload)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Novo movimento
          </DialogTitle>
          <DialogDescription>
            Registre um aporte, resgate ou crédito de juros. Valores em{' '}
            <span className="font-mono">{currencyCode}</span>.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label className={labelClass}>Tipo</Label>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Tabs
                  value={field.value}
                  onValueChange={(v) => field.onChange(v as MovementType)}
                >
                  <TabsList variant="line" className="border-b border-border/60">
                    <TabsTrigger
                      value="deposit"
                      className="data-active:text-success data-active:after:!bg-success"
                    >
                      Aporte
                    </TabsTrigger>
                    <TabsTrigger
                      value="withdrawal"
                      className="data-active:text-destructive data-active:after:!bg-destructive"
                    >
                      Resgate
                    </TabsTrigger>
                    <TabsTrigger
                      value="interest"
                      className="data-active:text-primary data-active:after:!bg-primary"
                    >
                      Juros
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="mv-amount" className={labelClass}>
                Valor
              </Label>
              <Input
                id="mv-amount"
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
              <Label htmlFor="mv-date" className={labelClass}>
                Data
              </Label>
              <Input
                id="mv-date"
                type="date"
                className={cn(inputClass, 'font-mono')}
                {...form.register('date')}
              />
              {form.formState.errors.date ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.date.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mv-notes" className={labelClass}>
              Notas
            </Label>
            <Textarea
              id="mv-notes"
              placeholder="Observações (opcional)"
              className="border-border/80 bg-background/50"
              {...form.register('notes')}
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
              {createMutation.isPending ? 'Salvando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
