export const SUPPORTED_CURRENCIES = ['BRL', 'USD', 'PYG', 'BTC', 'USDT'] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export const FIAT_CURRENCIES: readonly SupportedCurrency[] = ['BRL', 'USD', 'PYG']
export const CRYPTO_CURRENCIES: readonly SupportedCurrency[] = ['BTC', 'USDT']

export const TOTAL_OPTION = 'TOTAL' as const
export type CurrencyOrTotal = SupportedCurrency | typeof TOTAL_OPTION

export const CHART_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#f59e0b',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#ea580c',
  '#475569',
  '#0d9488',
  '#7c3aed',
]

export const CASHFLOW_INCOME_COLOR = '#16a34a'
export const CASHFLOW_EXPENSE_COLOR = '#dc2626'
export const FORECAST_IN_COLOR = '#86efac'
export const ACTUAL_IN_COLOR = '#16a34a'
export const FORECAST_OUT_COLOR = '#fca5a5'
export const ACTUAL_OUT_COLOR = '#dc2626'

export function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function firstDayOfMonth(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-01`
}

export function lastDayOfMonth(date: Date = new Date()): string {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`
}

export function startOfMonthOffset(monthsAgo: number): string {
  const d = new Date()
  const target = new Date(d.getFullYear(), d.getMonth() - monthsAgo, 1)
  return `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-01`
}

const MONTHS_PT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

export function formatBucketLabel(period: string, groupBy: 'month' | 'week' | 'day'): string {
  if (groupBy === 'month') {
    const [y, m] = period.split('-')
    if (!y || !m) return period
    const idx = parseInt(m, 10) - 1
    if (idx < 0 || idx > 11) return period
    return `${MONTHS_PT[idx]}/${y.slice(2)}`
  }
  if (groupBy === 'week' || groupBy === 'day') {
    const [y, m, d] = period.split('-')
    if (!y || !m || !d) return period
    return `${d}/${m}`
  }
  return period
}

export function formatDateBR(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}
