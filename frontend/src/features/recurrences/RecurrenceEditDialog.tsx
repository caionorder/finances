import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { accountsApi } from '@/lib/api/accounts'
import { CategoryCombobox } from '@/features/categories/CategoryCombobox'
import {
  recurrencesApi,
  type RecurrenceOut,
  type RecurrenceRule,
} from '@/lib/api/recurrences'
import { RecurrenceConfigForm } from './RecurrenceConfigForm'

const NO_CATEGORY = '__none__'
const NO_ACCOUNT = '__none__'
const CURRENCIES = ['BRL', 'USD', 'PYG'] as const

const LABEL = 'text-xs font-medium uppercase tracking-wider text-muted-foreground'
const INPUT = 'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'

type Props = {
  recurrence: RecurrenceOut | null
  onClose: () => void
}

type FormState = {
  description: string
  amount: string
  currency_code: string
  account_id: string
  category_id: string
  notes: string
}

function templateToForm(template: Record<string, unknown>): FormState {
  return {
    description:
      typeof template.description === 'string' ? template.description : '',
    amount: typeof template.amount === 'string' ? template.amount : '',
    currency_code:
      typeof template.currency_code === 'string' ? template.currency_code : 'BRL',
    account_id:
      typeof template.account_id === 'number'
        ? String(template.account_id)
        : NO_ACCOUNT,
    category_id:
      typeof template.category_id === 'number'
        ? String(template.category_id)
        : NO_CATEGORY,
    notes: typeof template.notes === 'string' ? template.notes : '',
  }
}

export function RecurrenceEditDialog({ recurrence, onClose }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() =>
    recurrence ? templateToForm(recurrence.template_json) : {
      description: '',
      amount: '',
      currency_code: 'BRL',
      account_id: NO_ACCOUNT,
      category_id: NO_CATEGORY,
      notes: '',
    }
  )
  const [rule, setRule] = useState<RecurrenceRule | null>(
    recurrence?.rule_json ?? null
  )
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (recurrence) {
      setForm(templateToForm(recurrence.template_json))
      setRule(recurrence.rule_json)
      setServerError(null)
    }
  }, [recurrence])

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: false }],
    queryFn: () => accountsApi.list(false),
    enabled: recurrence !== null,
  })

  const filteredAccounts = useMemo(() => {
    return (accountsQuery.data ?? []).filter(
      (a) => !a.is_archived && a.currency_code === form.currency_code
    )
  }, [accountsQuery.data, form.currency_code])

  const isPayable = recurrence?.kind === 'payable'

  const nextOccurrences = useMemo(() => {
    if (!rule || !recurrence?.next_run_date) return []
    return projectNextOccurrences(recurrence.next_run_date, rule, 3)
  }, [rule, recurrence?.next_run_date])

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!recurrence || !rule) {
        return Promise.reject(new Error('missing rule'))
      }
      const template: Record<string, unknown> = {
        ...recurrence.template_json,
        description: form.description,
        amount: normalizeDecimal(form.amount),
        currency_code: form.currency_code,
        notes: form.notes || null,
      }
      if (form.account_id === NO_ACCOUNT) {
        template.account_id = null
      } else {
        template.account_id = Number(form.account_id)
      }
      if (form.category_id === NO_CATEGORY) {
        template.category_id = null
      } else {
        template.category_id = Number(form.category_id)
      }
      return recurrencesApi.update(recurrence.id, {
        rule,
        template,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurrences'] })
      toast.success('Recorrência atualizada')
      onClose()
    },
    onError: (err) =>
      setServerError(extractError(err, 'Falha ao atualizar recorrência.')),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setServerError(null)
    if (!form.description.trim()) {
      setServerError('Informe a descrição.')
      return
    }
    const amountNum = parseFloat(normalizeDecimal(form.amount))
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setServerError('Informe um valor maior que zero.')
      return
    }
    if (!rule) {
      setServerError('Configure a regra de recorrência.')
      return
    }
    updateMutation.mutate()
  }

  return (
    <Dialog
      open={recurrence !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto border-border/60 bg-card backdrop-blur-xl sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Editar recorrência
          </DialogTitle>
          <DialogDescription>
            Atualize a regra e os dados do template. As próximas ocorrências
            serão geradas com base no novo padrão.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="rec-edit-desc" className={LABEL}>
              Descrição
            </Label>
            <Input
              id="rec-edit-desc"
              className={INPUT}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rec-edit-amount" className={LABEL}>
                Valor
              </Label>
              <Input
                id="rec-edit-amount"
                inputMode="decimal"
                placeholder="0.00"
                className={`${INPUT} font-mono tabular-nums`}
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label className={LABEL}>Moeda</Label>
              <Select
                value={form.currency_code}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    currency_code: v,
                    account_id: NO_ACCOUNT,
                  }))
                }
              >
                <SelectTrigger className={`${INPUT} font-mono`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className={LABEL}>Conta</Label>
              <Select
                value={form.account_id}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, account_id: v }))
                }
              >
                <SelectTrigger className={INPUT}>
                  <SelectValue placeholder="Sem conta vinculada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ACCOUNT}>Sem conta vinculada</SelectItem>
                  {filteredAccounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name} ({a.currency_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className={LABEL}>Categoria</Label>
              <CategoryCombobox
                value={
                  form.category_id !== NO_CATEGORY
                    ? Number(form.category_id)
                    : null
                }
                onChange={(next) =>
                  setForm((f) => ({
                    ...f,
                    category_id: next == null ? NO_CATEGORY : String(next),
                  }))
                }
                kind={isPayable ? 'expense' : 'income'}
                placeholder="Sem categoria"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rec-edit-notes" className={LABEL}>
              Notas
            </Label>
            <Textarea
              id="rec-edit-notes"
              rows={2}
              className="border-border/80 bg-background/50"
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>

          <RecurrenceConfigForm value={rule} onChange={setRule} />

          {nextOccurrences.length > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2.5">
              <Sparkles
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
                strokeWidth={2.25}
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Próximas ocorrências projetadas
                </p>
                <ul className="space-y-0.5 text-xs text-foreground">
                  {nextOccurrences.map((d) => (
                    <li
                      key={d}
                      className="font-mono tabular-nums text-muted-foreground"
                    >
                      {formatDateBR(d)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {serverError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
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
              className="shadow-[0_0_24px_-8px_var(--color-primary)]"
            >
              {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function normalizeDecimal(v: string): string {
  return v.trim().replace(',', '.')
}

function formatDateBR(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}

function projectNextOccurrences(
  startDate: string,
  rule: RecurrenceRule,
  count: number
): string[] {
  const out: string[] = []
  const parts = startDate.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return out

  const untilTs = rule.until ? Date.parse(`${rule.until}T23:59:59Z`) : null

  const interval = Math.max(1, rule.interval || 1)
  const day = rule.day
  const month = rule.month

  let cursor = new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!))

  for (let i = 0; i < count; i++) {
    if (i === 0) {
      out.push(toIso(cursor))
    } else {
      cursor = advance(cursor, rule.freq, interval, day, month)
      const ts = cursor.getTime()
      if (untilTs !== null && ts > untilTs) break
      out.push(toIso(cursor))
    }
  }
  return out
}

function advance(
  current: Date,
  freq: RecurrenceRule['freq'],
  interval: number,
  day?: number,
  month?: number
): Date {
  if (freq === 'weekly') {
    return new Date(current.getTime() + interval * 7 * 24 * 60 * 60 * 1000)
  }
  if (freq === 'monthly') {
    const y = current.getUTCFullYear()
    const m = current.getUTCMonth() + interval
    const targetYear = y + Math.floor(m / 12)
    const targetMonth = ((m % 12) + 12) % 12
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
    const desiredDay = day ?? current.getUTCDate()
    return new Date(Date.UTC(targetYear, targetMonth, Math.min(desiredDay, lastDay)))
  }
  if (freq === 'yearly') {
    const newYear = current.getUTCFullYear() + interval
    const targetMonth = (month ?? current.getUTCMonth() + 1) - 1
    const lastDay = new Date(Date.UTC(newYear, targetMonth + 1, 0)).getUTCDate()
    const desiredDay = day ?? current.getUTCDate()
    return new Date(Date.UTC(newYear, targetMonth, Math.min(desiredDay, lastDay)))
  }
  return current
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
