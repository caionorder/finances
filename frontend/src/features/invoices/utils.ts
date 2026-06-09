import Decimal from 'decimal.js'
import { isAxiosError } from 'axios'

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Formats an ISO `YYYY-MM-DD` date as `DD/MM/YYYY` without timezone drift. */
export function formatDateBR(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)
      ?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string } | undefined
      if (first?.msg) return first.msg
    }
  }
  return fallback
}

/** Safely build a Decimal from a money string, defaulting to 0 on garbage. */
export function toDecimal(value: string | null | undefined): Decimal {
  if (!value) return new Decimal(0)
  try {
    return new Decimal(value.trim().replace(',', '.'))
  } catch {
    return new Decimal(0)
  }
}

export type LineTotals = {
  subtotal: Decimal
  taxTotal: Decimal
}

/** Live computation mirroring the backend `_compute_totals` (2dp, half-up). */
export function computeLineItemTotals(rows: {
  quantity: string
  unit_price: string
  tax_rate: string
}[]): { rows: LineTotals[]; subtotal: Decimal; taxTotal: Decimal } {
  const out: LineTotals[] = []
  let subtotal = new Decimal(0)
  let taxTotal = new Decimal(0)
  for (const r of rows) {
    const qty = toDecimal(r.quantity)
    const unit = toDecimal(r.unit_price)
    const rate = toDecimal(r.tax_rate)
    const lineSubtotal = qty.times(unit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    const lineTax = lineSubtotal
      .times(rate)
      .dividedBy(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    out.push({ subtotal: lineSubtotal, taxTotal: lineTax })
    subtotal = subtotal.plus(lineSubtotal)
    taxTotal = taxTotal.plus(lineTax)
  }
  return {
    rows: out,
    subtotal: subtotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    taxTotal: taxTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  }
}
