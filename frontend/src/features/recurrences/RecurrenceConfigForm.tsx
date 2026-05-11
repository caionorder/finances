import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  RecurrenceFreq,
  RecurrenceRule,
} from '@/lib/api/recurrences'

type Props = {
  value: RecurrenceRule | null
  onChange: (rule: RecurrenceRule) => void
}

const LABEL = 'text-xs font-medium uppercase tracking-wider text-muted-foreground'
const INPUT = 'h-9 border-border/80 bg-background/50 transition-colors focus:border-primary'

const FREQ_OPTIONS: { value: Exclude<RecurrenceFreq, 'custom'>; label: string }[] =
  [
    { value: 'weekly', label: 'Semanal' },
    { value: 'monthly', label: 'Mensal' },
    { value: 'yearly', label: 'Anual' },
  ]

const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
]

const MONTHS = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
]

export function RecurrenceConfigForm({ value, onChange }: Props) {
  const initial = value ?? defaultRule()
  const [freq, setFreq] = useState<Exclude<RecurrenceFreq, 'custom'>>(
    isSimpleFreq(initial.freq) ? initial.freq : 'monthly'
  )
  const [interval, setIntervalValue] = useState<number>(initial.interval || 1)
  const [day, setDay] = useState<number>(
    typeof initial.day === 'number' ? initial.day : freq === 'weekly' ? 1 : 1
  )
  const [month, setMonth] = useState<number>(
    typeof initial.month === 'number' ? initial.month : 1
  )
  const [hasUntil, setHasUntil] = useState<boolean>(Boolean(initial.until))
  const [until, setUntil] = useState<string>(initial.until ?? '')

  const buildRule = useCallback((): RecurrenceRule => {
    const rule: RecurrenceRule = {
      freq,
      interval: Math.max(1, Math.min(12, Number(interval) || 1)),
    }
    if (freq === 'weekly') {
      rule.day = clampInt(day, 0, 6)
    } else if (freq === 'monthly') {
      rule.day = clampInt(day, 1, 31)
    } else if (freq === 'yearly') {
      rule.day = clampInt(day, 1, 31)
      rule.month = clampInt(month, 1, 12)
    }
    if (hasUntil && until) rule.until = until
    return rule
  }, [freq, interval, day, month, hasUntil, until])

  useEffect(() => {
    onChange(buildRule())
  }, [buildRule, onChange])

  const preview = useMemo(() => {
    return describeRule(buildRule())
  }, [buildRule])

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-background/50 p-4">
      <div className="flex items-center gap-2">
        <span className="status-dot bg-primary shadow-[0_0_8px_var(--color-primary)]" aria-hidden="true" />
        <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Configuração da recorrência
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className={LABEL}>Frequência</Label>
          <Select
            value={freq}
            onValueChange={(v) => {
              const next = v as Exclude<RecurrenceFreq, 'custom'>
              setFreq(next)
              if (next === 'weekly') {
                setDay((d) => (d > 6 ? 1 : d))
              } else {
                setDay((d) => (d < 1 ? 1 : d > 31 ? 31 : d))
              }
            }}
          >
            <SelectTrigger className={INPUT}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQ_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="rec-interval" className={LABEL}>
            A cada N {intervalUnit(freq)}
          </Label>
          <Input
            id="rec-interval"
            type="number"
            min={1}
            max={12}
            step={1}
            value={interval}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              setIntervalValue(Number.isFinite(n) ? n : 1)
            }}
            className={`${INPUT} font-mono tabular-nums`}
          />
        </div>
      </div>

      {freq === 'weekly' ? (
        <div className="space-y-2">
          <Label className={LABEL}>Dia da semana</Label>
          <Select value={String(day)} onValueChange={(v) => setDay(Number(v))}>
            <SelectTrigger className={INPUT}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((w) => (
                <SelectItem key={w.value} value={String(w.value)}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {freq === 'monthly' ? (
        <div className="space-y-2">
          <Label htmlFor="rec-day-month" className={LABEL}>
            Dia do mês
          </Label>
          <Input
            id="rec-day-month"
            type="number"
            min={1}
            max={31}
            step={1}
            value={day}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              setDay(Number.isFinite(n) ? n : 1)
            }}
            className={`${INPUT} font-mono tabular-nums`}
          />
          <p className="text-[11px] text-muted-foreground">
            Se o mês não tiver esse dia, a próxima ocorrência será no último dia
            disponível.
          </p>
        </div>
      ) : null}

      {freq === 'yearly' ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="rec-day-year" className={LABEL}>
              Dia do mês
            </Label>
            <Input
              id="rec-day-year"
              type="number"
              min={1}
              max={31}
              step={1}
              value={day}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                setDay(Number.isFinite(n) ? n : 1)
              }}
              className={`${INPUT} font-mono tabular-nums`}
            />
          </div>
          <div className="space-y-2">
            <Label className={LABEL}>Mês</Label>
            <Select
              value={String(month)}
              onValueChange={(v) => setMonth(Number(v))}
            >
              <SelectTrigger className={INPUT}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="rec-has-until" className="cursor-pointer text-sm font-medium">
            Termina em data específica
          </Label>
          <Switch
            id="rec-has-until"
            checked={hasUntil}
            onCheckedChange={(v) => {
              const next = Boolean(v)
              setHasUntil(next)
              if (!next) setUntil('')
            }}
          />
        </div>
        {hasUntil ? (
          <Input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            aria-label="Data de término"
            className={`${INPUT} font-mono tabular-nums`}
          />
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Sem data de término — gera ocorrências indefinidamente.
          </p>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.25} aria-hidden="true" />
        <div className="space-y-0.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Pré-visualização
          </p>
          <p className="text-xs leading-relaxed text-foreground">{preview}</p>
        </div>
      </div>
    </div>
  )
}

function defaultRule(): RecurrenceRule {
  return { freq: 'monthly', interval: 1, day: 1 }
}

function isSimpleFreq(
  f: RecurrenceFreq
): f is Exclude<RecurrenceFreq, 'custom'> {
  return f === 'weekly' || f === 'monthly' || f === 'yearly'
}

function clampInt(v: number, min: number, max: number): number {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

function intervalUnit(f: RecurrenceFreq): string {
  if (f === 'weekly') return 'semana(s)'
  if (f === 'monthly') return 'mês(es)'
  if (f === 'yearly') return 'ano(s)'
  return 'período(s)'
}

export function describeRule(rule: RecurrenceRule): string {
  const interval = Math.max(1, rule.interval || 1)
  const unit = intervalUnit(rule.freq)
  const intervalText =
    interval === 1 ? `Cada ${singularUnit(rule.freq)}` : `A cada ${interval} ${unit}`

  let detail = ''
  if (rule.freq === 'weekly') {
    const w = WEEKDAYS.find((x) => x.value === rule.day)
    detail = w ? `, na ${w.label.toLowerCase()}` : ''
  } else if (rule.freq === 'monthly') {
    detail = rule.day ? `, no dia ${rule.day}` : ''
  } else if (rule.freq === 'yearly') {
    const m = MONTHS.find((x) => x.value === rule.month)
    detail = `, no dia ${rule.day ?? 1}${m ? ` de ${m.label}` : ''}`
  }

  const untilText = rule.until ? ` até ${formatDateBR(rule.until)}` : ''
  return `${intervalText}${detail}${untilText}.`
}

function singularUnit(f: RecurrenceFreq): string {
  if (f === 'weekly') return 'semana'
  if (f === 'monthly') return 'mês'
  if (f === 'yearly') return 'ano'
  return 'período'
}

function formatDateBR(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}
