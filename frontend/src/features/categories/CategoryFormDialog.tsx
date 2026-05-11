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
import {
  categoriesApi,
  type CategoryCreate,
  type CategoryKind,
  type CategoryOut,
  type CategoryUpdate,
} from '@/lib/api/categories'

const KINDS: { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'Despesa' },
  { value: 'income', label: 'Receita' },
  { value: 'transfer', label: 'Transferência' },
]

const schema = z.object({
  name: z.string().min(1, 'Informe o nome'),
  kind: z.enum(['income', 'expense', 'transfer'] as const),
  parent_id: z.string(),
  icon: z.string().max(8, 'Máximo 8 caracteres').optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use formato hexadecimal #RRGGBB')
    .optional()
    .or(z.literal('')),
  sort_order: z
    .string()
    .regex(/^\d+$/, 'Apenas números')
    .refine((v) => Number(v) <= 999, { message: 'Máximo 999' }),
})

type FormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: CategoryOut | null
  defaults?: { parent_id: number | null; kind: CategoryKind } | null
}

export function CategoryFormDialog({ open, onOpenChange, category, defaults }: Props) {
  const isEdit = Boolean(category)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const allCategoriesQuery = useQuery({
    queryKey: ['categories', 'list-all'],
    queryFn: () => categoriesApi.list(),
    enabled: open,
  })

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      kind: 'expense',
      parent_id: 'root',
      icon: '',
      color: '',
      sort_order: '0',
    },
  })

  useEffect(() => {
    if (!open) {
      setServerError(null)
      return
    }
    if (isEdit && category) {
      form.reset({
        name: category.name,
        kind: category.kind,
        parent_id: category.parent_id ? String(category.parent_id) : 'root',
        icon: category.icon ?? '',
        color: category.color ?? '',
        sort_order: String(category.sort_order),
      })
    } else {
      form.reset({
        name: '',
        kind: defaults?.kind ?? 'expense',
        parent_id: defaults?.parent_id ? String(defaults.parent_id) : 'root',
        icon: '',
        color: '',
        sort_order: '0',
      })
    }
  }, [open, isEdit, category, defaults, form])

  const watchedKind = form.watch('kind')
  const watchedColor = form.watch('color')

  const parentOptions = useMemo(() => {
    if (!allCategoriesQuery.data) return [] as CategoryOut[]
    return allCategoriesQuery.data
      .filter((c) => c.kind === watchedKind && (!isEdit || c.id !== category?.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [allCategoriesQuery.data, watchedKind, isEdit, category?.id])

  const createMutation = useMutation({
    mutationFn: (payload: CategoryCreate) => categoriesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Categoria criada')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível criar a categoria.'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: CategoryUpdate) =>
      categoriesApi.update(category!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Categoria atualizada')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível atualizar a categoria.'))
    },
  })

  function onSubmit(values: FormValues) {
    setServerError(null)
    const parentId = values.parent_id === 'root' ? null : Number(values.parent_id)
    const sortOrder = Number(values.sort_order)
    if (isEdit) {
      updateMutation.mutate({
        name: values.name,
        parent_id: parentId,
        icon: values.icon || '',
        color: values.color || '',
        sort_order: sortOrder,
      })
    } else {
      createMutation.mutate({
        name: values.name,
        kind: values.kind,
        parent_id: parentId,
        icon: values.icon || undefined,
        color: values.color || undefined,
        sort_order: sortOrder,
      })
    }
  }

  const validHex = /^#[0-9a-fA-F]{6}$/.test(watchedColor || '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/60 bg-card backdrop-blur-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {isEdit ? 'Editar categoria' : 'Nova categoria'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize os dados da categoria. O tipo (receita/despesa) não pode ser alterado.'
              : 'Defina nome, tipo e categoria pai (opcional).'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="cat-name" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Nome
            </Label>
            <Input
              id="cat-name"
              className="h-10 border-border/80 bg-background/50 transition-colors focus:border-primary"
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Tipo
              </Label>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isEdit}
                  >
                    <SelectTrigger className="h-10 border-border/80 bg-background/50">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {KINDS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Categoria pai
              </Label>
              <Controller
                control={form.control}
                name="parent_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-10 border-border/80 bg-background/50">
                      <SelectValue placeholder="— raiz —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">— raiz —</SelectItem>
                      {parentOptions.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-2">
              <Label htmlFor="cat-icon" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Ícone
              </Label>
              <Input
                id="cat-icon"
                placeholder="🍔"
                className="h-10 border-border/80 bg-background/50 text-center transition-colors focus:border-primary"
                {...form.register('icon')}
              />
              {form.formState.errors.icon ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.icon.message}
                </p>
              ) : null}
            </div>
            <div className="col-span-1 space-y-2">
              <Label htmlFor="cat-color" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cor
              </Label>
              <div className="relative">
                <Input
                  id="cat-color"
                  placeholder="#22c55e"
                  className="h-10 border-border/80 bg-background/50 pr-9 font-mono text-xs uppercase transition-colors focus:border-primary"
                  {...form.register('color')}
                />
                {validHex ? (
                  <span
                    className="pointer-events-none absolute right-2 top-1/2 inline-block h-4 w-4 -translate-y-1/2 rounded-full ring-1 ring-border"
                    style={{ backgroundColor: watchedColor }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              {form.formState.errors.color ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.color.message}
                </p>
              ) : null}
            </div>
            <div className="col-span-1 space-y-2">
              <Label htmlFor="cat-sort" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Ordem
              </Label>
              <Input
                id="cat-sort"
                type="number"
                min={0}
                step={1}
                className="h-10 border-border/80 bg-background/50 font-mono tabular-nums transition-colors focus:border-primary"
                {...form.register('sort_order')}
              />
            </div>
          </div>

          {serverError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {serverError}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="shadow-[0_0_24px_-8px_var(--color-primary)]"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Salvando...'
                : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
