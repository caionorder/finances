import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Shield,
} from 'lucide-react'
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
import { cn } from '@/lib/utils'

export const AVAILABLE_SCOPES = [
  {
    value: 'transactions:write',
    label: 'Criar transações',
    description: 'Permite criar novas movimentações financeiras.',
    icon: ArrowDownToLine,
  },
  {
    value: 'accounts:write',
    label: 'Criar contas',
    description: 'Permite criar e atualizar contas bancárias.',
    icon: ArrowUpFromLine,
  },
  {
    value: 'reports:read',
    label: 'Ler relatórios',
    description: 'Acesso somente leitura aos relatórios e métricas.',
    icon: BarChart3,
  },
] as const

const SCOPE_VALUES = AVAILABLE_SCOPES.map((s) => s.value)

const schema = z.object({
  name: z.string().trim().min(1, 'Informe um nome'),
  scopes: z.array(z.string()).min(1, 'Selecione ao menos um scope'),
})

type FormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending?: boolean
  onSubmit: (values: { name: string; scopes: string[] }) => void
  serverError?: string | null
  onClearError?: () => void
}

const inputClass =
  'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'
const labelClass =
  'text-xs font-medium uppercase tracking-wider text-muted-foreground'

export function ApiKeyFormDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
  serverError,
  onClearError,
}: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', scopes: [] },
  })
  const [resetTick, setResetTick] = useState(0)

  useEffect(() => {
    if (open) {
      form.reset({ name: '', scopes: [] })
      onClearError?.()
      setResetTick((t) => t + 1)
    }
  }, [open, form, onClearError])

  function handleSubmit(values: FormValues) {
    onSubmit({ name: values.name.trim(), scopes: values.scopes })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Nova chave de API
          </DialogTitle>
          <DialogDescription>
            Defina um nome descritivo e os scopes que essa chave poderá utilizar.
          </DialogDescription>
        </DialogHeader>

        <form
          key={resetTick}
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="api-key-name" className={labelClass}>
              Nome
            </Label>
            <Input
              id="api-key-name"
              placeholder="Ex.: Cron de import diário"
              className={inputClass}
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label className={labelClass}>Scopes</Label>
            <Controller
              control={form.control}
              name="scopes"
              render={({ field }) => (
                <div className="space-y-2">
                  {AVAILABLE_SCOPES.map((scope) => {
                    const checked = field.value.includes(scope.value)
                    const inputId = `scope-${scope.value}`
                    const Icon = scope.icon
                    return (
                      <label
                        key={scope.value}
                        htmlFor={inputId}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                          checked
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-border/60 bg-card hover:border-border hover:bg-accent/40'
                        )}
                      >
                        <Checkbox
                          id={inputId}
                          checked={checked}
                          onCheckedChange={(next) => {
                            if (next) {
                              if (!checked) field.onChange([...field.value, scope.value])
                            } else {
                              field.onChange(
                                field.value.filter((v) => v !== scope.value)
                              )
                            }
                          }}
                          className="mt-0.5"
                        />
                        <div
                          className={cn(
                            'grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 transition-colors',
                            checked
                              ? 'bg-primary/15 text-primary ring-primary/30'
                              : 'bg-muted text-muted-foreground ring-border'
                          )}
                        >
                          <Icon className="h-4 w-4" strokeWidth={2.25} />
                        </div>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-sm font-medium leading-none">
                            {scope.label}
                          </span>
                          <code className="font-mono text-[11px] text-muted-foreground">
                            {scope.value}
                          </code>
                          <span className="text-xs text-muted-foreground">
                            {scope.description}
                          </span>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            />
            {form.formState.errors.scopes ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.scopes.message as string}
              </p>
            ) : null}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>A chave secreta é exibida apenas uma vez após a criação.</span>
          </div>

          {serverError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="transition-shadow hover:shadow-[0_0_24px_-6px_var(--color-primary)]"
            >
              {pending ? 'Criando...' : 'Criar chave'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function isKnownScope(value: string): boolean {
  return (SCOPE_VALUES as readonly string[]).includes(value)
}
