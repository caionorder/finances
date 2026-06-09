import { z } from 'zod'
import Decimal from 'decimal.js'

/**
 * Money/decimal validators kept aligned with the backend Pydantic bounds
 * (see `backend/app/schemas/invoice.py`):
 *   - quantity:   gt 0
 *   - unit_price: gt 0   (was the client/server mismatch causing late 422s)
 *   - tax_rate:   ge 0
 *   - discount_total: ge 0
 *
 * Magnitude checks use decimal.js — never float math — so values like
 * "0.001" or long fractions compare correctly. Accepts `.` or `,` separator.
 */
const DECIMAL_RE = /^\d+([.,]\d+)?$/

function toDec(v: string): Decimal | null {
  try {
    return new Decimal(v.trim().replace(',', '.'))
  } catch {
    return null
  }
}

const positiveDecimal = z
  .string()
  .trim()
  .regex(DECIMAL_RE, 'Valor inválido')
  .refine((v) => {
    const d = toDec(v)
    return d !== null && d.greaterThan(0)
  }, 'Deve ser maior que zero')

const nonNegativeDecimal = z
  .string()
  .trim()
  .regex(DECIMAL_RE, 'Valor inválido')
  .refine((v) => {
    const d = toDec(v)
    return d !== null && d.greaterThanOrEqualTo(0)
  }, 'Não pode ser negativo')

export const lineItemSchema = z.object({
  description: z.string().trim().min(1, 'Informe a descrição').max(500),
  quantity: positiveDecimal,
  unit_price: positiveDecimal,
  tax_rate: nonNegativeDecimal,
})

export type LineItemValues = z.infer<typeof lineItemSchema>

export const invoiceEditorSchema = z.object({
  customer_id: z.string().min(1, 'Selecione um cliente'),
  contract_id: z.string(),
  category_id: z.string(),
  due_date: z.string().min(1, 'Informe o vencimento'),
  issue_date: z.string().optional(),
  service_period_start: z.string().optional(),
  service_period_end: z.string().optional(),
  discount_total: nonNegativeDecimal,
  po_number: z.string().max(60).optional(),
  terms: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  line_items: z.array(lineItemSchema).min(1, 'Adicione ao menos um item'),
})

export type InvoiceEditorValues = z.infer<typeof invoiceEditorSchema>

export function normalizeDecimal(v: string): string {
  return v.trim().replace(',', '.')
}
