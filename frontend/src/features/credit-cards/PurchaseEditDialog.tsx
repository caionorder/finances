import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { categoriesApi, type CategoryOut } from '@/lib/api/categories'
import {
  purchasesApi,
  type PurchaseOut,
  type PurchaseUpdate,
} from '@/lib/api/purchases'
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

const schema = z.object({
  amount: decimalString,
  description: z.string().max(500, 'Máximo 500 caracteres').optional(),
  merchant: z.string().max(200, 'Máximo 200 caracteres').optional(),
  category_id: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

type Props = {
  purchase: PurchaseOut | null
  cardId: number
  onClose: () => void
}

const labelClass = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground'
const inputClass = 'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'

export function PurchaseEditDialog({ purchase, cardId, onClose }: Props) {
  const open = purchase !== null
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: '',
      description: '',
      merchant: '',
      category_id: NONE_CATEGORY,
    },
  })

  useEffect(() => {
    if (!open || !purchase) {
      setServerError(null)
      return
    }
    form.reset({
      amount: purchase.amount,
      description: purchase.description ?? '',
      merchant: purchase.merchant ?? '',
      category_id: purchase.category_id
        ? String(purchase.category_id)
        : NONE_CATEGORY,
    })
  }, [open, purchase, form])

  const categoriesQuery = useQuery({
    queryKey: ['categories', 'list-all'],
    queryFn: () => categoriesApi.list(),
    enabled: open,
  })

  const expenseCategories = useMemo(() => {
    return (categoriesQuery.data ?? [])
      .filter((c) => c.kind === 'expense')
      .sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
        return a.name.localeCompare(b.name, 'pt-BR')
      })
  }, [categoriesQuery.data])

  const categoryById = useMemo(() => {
    const m = new Map<number, CategoryOut>()
    for (const c of categoriesQuery.data ?? []) m.set(c.id, c)
    return m
  }, [categoriesQuery.data])

  const updateMutation = useMutation({
    mutationFn: (payload: PurchaseUpdate) =>
      purchasesApi.update(purchase!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycles', cardId] })
      queryClient.invalidateQueries({ queryKey: ['purchases', cardId] })
      queryClient.invalidateQueries({ queryKey: ['credit-cards'] })
      toast.success('Compra atualizada')
      onClose()
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível atualizar a compra.'))
    },
  })

  function handleSubmit(values: FormValues) {
    setServerError(null)
    const payload: PurchaseUpdate = {
      amount: normalizeDecimal(values.amount),
      description: values.description ?? '',
      merchant: values.merchant ?? '',
      category_id:
        values.category_id && values.category_id !== NONE_CATEGORY
          ? Number(values.category_id)
          : null,
    }
    updateMutation.mutate(payload)
  }

  const isSeries = purchase ? purchase.installment_of > 1 : false

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Editar compra
          </DialogTitle>
          <DialogDescription>
            Edite valor, descrição, estabelecimento ou categoria. Data da compra
            e parcelamento não podem ser alterados.
          </DialogDescription>
        </DialogHeader>

        {isSeries ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-warning">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Editar uma parcela individual <strong>não afeta</strong> as outras
              parcelas da série (
              <span className="font-mono tabular-nums">
                {purchase!.installment_n}/{purchase!.installment_of}
              </span>
              ).
            </span>
          </div>
        ) : null}

        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="purchase-edit-amount" className={labelClass}>
              Valor
            </Label>
            <Input
              id="purchase-edit-amount"
              type="text"
              inputMode="decimal"
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
            <Label htmlFor="purchase-edit-description" className={labelClass}>
              Descrição
            </Label>
            <Input
              id="purchase-edit-description"
              className={inputClass}
              {...form.register('description')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchase-edit-merchant" className={labelClass}>
              Estabelecimento
            </Label>
            <Input
              id="purchase-edit-merchant"
              className={inputClass}
              {...form.register('merchant')}
            />
          </div>

          <div className="space-y-2">
            <Label className={labelClass}>Categoria</Label>
            <Controller
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Sem categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_CATEGORY}>Sem categoria</SelectItem>
                    {expenseCategories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {indentFor(c, categoryById)}
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {serverError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]"
            >
              {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function indentFor(
  cat: CategoryOut,
  byId: Map<number, CategoryOut>
): string {
  let depth = 0
  let cursor = cat
  while (cursor.parent_id != null) {
    const parent = byId.get(cursor.parent_id)
    if (!parent) break
    depth += 1
    cursor = parent
    if (depth > 8) break
  }
  return depth ? '— '.repeat(depth) : ''
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
