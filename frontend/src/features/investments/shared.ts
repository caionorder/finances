import type {
  IndexRef,
  InvestmentType,
  Liquidity,
  MovementType,
  RateKind,
  RatePeriod,
} from '@/lib/api/investments'

export const INVESTMENT_TYPES: { value: InvestmentType; label: string }[] = [
  { value: 'cdb', label: 'CDB' },
  { value: 'lci', label: 'LCI' },
  { value: 'lca', label: 'LCA' },
  { value: 'tesouro', label: 'Tesouro' },
  { value: 'poupanca', label: 'Poupança' },
  { value: 'fundo', label: 'Fundo' },
  { value: 'acoes', label: 'Ações' },
  { value: 'cripto', label: 'Cripto' },
  { value: 'outros', label: 'Outros' },
]

export const INVESTMENT_TYPE_LABEL: Record<InvestmentType, string> =
  INVESTMENT_TYPES.reduce<Record<InvestmentType, string>>((acc, t) => {
    acc[t.value] = t.label
    return acc
  }, {} as Record<InvestmentType, string>)

export type BadgeTone =
  | 'primary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'muted'

export const TYPE_TONE: Record<InvestmentType, BadgeTone> = {
  cdb: 'primary',
  lci: 'primary',
  lca: 'primary',
  tesouro: 'success',
  poupanca: 'muted',
  fundo: 'warning',
  acoes: 'warning',
  cripto: 'destructive',
  outros: 'muted',
}

export const RATE_PERIOD_LABEL: Record<RatePeriod, string> = {
  monthly: 'Mensal',
  semiannual: 'Semestral',
  annual: 'Anual',
}

export const RATE_KIND_LABEL: Record<RateKind, string> = {
  fixed: 'Fixa',
  percent_of_index: '% do indexador',
  index_plus: 'Indexador + spread',
}

export const INDEX_REF_LABEL: Record<IndexRef, string> = {
  cdi: 'CDI',
  selic: 'SELIC',
  ipca: 'IPCA',
  igpm: 'IGP-M',
}

export const LIQUIDITY_LABEL: Record<Liquidity, string> = {
  daily: 'Diária',
  on_maturity: 'No vencimento',
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  deposit: 'Aporte',
  withdrawal: 'Resgate',
  interest: 'Juros',
}

export const MOVEMENT_TONE: Record<MovementType, BadgeTone> = {
  deposit: 'success',
  withdrawal: 'destructive',
  interest: 'primary',
}

export const TONE_CLASSES: Record<BadgeTone, string> = {
  primary: 'border-primary/30 bg-primary/10 text-primary',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
  muted:
    'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
}

export function toneClass(tone: BadgeTone): string {
  return TONE_CLASSES[tone]
}

export function formatDateBR(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addMonthsISO(base: string, months: number): string {
  const [y, m, d] = base.split('-').map(Number)
  if (!y || !m || !d) return base
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCMonth(dt.getUTCMonth() + months)
  return dt.toISOString().slice(0, 10)
}

export function normalizeDecimal(v: string): string {
  return v.trim().replace(',', '.')
}
