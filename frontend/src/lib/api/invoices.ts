import { api } from './client'

export type InvoiceStatus = 'draft' | 'issued' | 'sent' | 'paid' | 'void'

/** Includes the derived `overdue` pseudo-status accepted by the list filter. */
export type InvoiceStatusFilter = InvoiceStatus | 'overdue'

export type InvoiceLineItemOut = {
  id: number
  position: number
  description: string
  quantity: string
  unit_price: string
  tax_rate: string
  line_subtotal: string
  line_tax: string
}

export type InvoiceLineItemCreate = {
  description: string
  quantity?: string
  unit_price: string
  tax_rate?: string
}

export type InvoiceOut = {
  id: number
  number: string | null
  status: InvoiceStatus
  overdue: boolean
  customer_id: number
  contract_id: number | null
  category_id: number | null
  receivable_id: number | null
  currency_code: string
  issue_date: string | null
  due_date: string
  service_period_start: string | null
  service_period_end: string | null
  subtotal: string
  discount_total: string
  tax_total: string
  total: string
  bank_fee_amount: string
  net_amount: string
  po_number: string | null
  terms: string | null
  notes: string | null
  void_reason: string | null
  pdf_path: string | null
  pdf_generated_at: string | null
  issued_at: string | null
  sent_at: string | null
  voided_at: string | null
  created_at: string
  updated_at: string
  line_items: InvoiceLineItemOut[]
}

export type InvoiceCreate = {
  customer_id: number
  contract_id?: number | null
  category_id?: number | null
  currency_code?: string
  issue_date?: string | null
  due_date: string
  service_period_start?: string | null
  service_period_end?: string | null
  discount_total?: string
  po_number?: string | null
  terms?: string | null
  notes?: string | null
  line_items?: InvoiceLineItemCreate[]
}

export type InvoiceUpdate = Partial<{
  customer_id: number
  contract_id: number | null
  category_id: number | null
  issue_date: string | null
  due_date: string
  service_period_start: string | null
  service_period_end: string | null
  discount_total: string
  po_number: string | null
  terms: string | null
  notes: string | null
  line_items: InvoiceLineItemCreate[]
}>

export type InvoiceFromContractRequest = {
  contract_id: number
  due_date?: string | null
}

export type InvoiceListResponse = {
  items: InvoiceOut[]
  next_cursor: string | null
  limit: number
}

export type InvoiceListParams = {
  status?: InvoiceStatusFilter
  customer_id?: number
  from?: string
  to?: string
  search?: string
  cursor?: string | null
  limit?: number
}

export type InvoiceAgingBucket = {
  count: number
  total: string
}

export type InvoiceOutstandingSummary = {
  currency_code: string
  total: string
  count: number
  by_bucket: Record<string, InvoiceAgingBucket>
}

function buildParams(params: InvoiceListParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (params.status) out.status = params.status
  if (params.customer_id !== undefined) out.customer_id = params.customer_id
  if (params.from) out.from = params.from
  if (params.to) out.to = params.to
  if (params.search) out.search = params.search
  if (params.cursor) out.cursor = params.cursor
  if (params.limit !== undefined) out.limit = params.limit
  return out
}

export const invoicesApi = {
  list: async (params: InvoiceListParams = {}): Promise<InvoiceListResponse> => {
    const { data } = await api.get<InvoiceListResponse>('/invoices', {
      params: buildParams(params),
    })
    return data
  },
  outstandingSummary: async (): Promise<InvoiceOutstandingSummary> => {
    const { data } = await api.get<InvoiceOutstandingSummary>(
      '/invoices/outstanding-summary'
    )
    return data
  },
  get: async (id: number): Promise<InvoiceOut> => {
    const { data } = await api.get<InvoiceOut>(`/invoices/${id}`)
    return data
  },
  create: async (payload: InvoiceCreate): Promise<InvoiceOut> => {
    const { data } = await api.post<InvoiceOut>('/invoices', payload)
    return data
  },
  fromContract: async (
    payload: InvoiceFromContractRequest
  ): Promise<InvoiceOut> => {
    const { data } = await api.post<InvoiceOut>(
      '/invoices/from-contract',
      payload
    )
    return data
  },
  update: async (id: number, payload: InvoiceUpdate): Promise<InvoiceOut> => {
    const { data } = await api.patch<InvoiceOut>(`/invoices/${id}`, payload)
    return data
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/invoices/${id}`)
  },
  issue: async (id: number): Promise<InvoiceOut> => {
    const { data } = await api.post<InvoiceOut>(`/invoices/${id}/issue`)
    return data
  },
  markSent: async (id: number): Promise<InvoiceOut> => {
    const { data } = await api.post<InvoiceOut>(`/invoices/${id}/mark-sent`)
    return data
  },
  markReceived: async (
    id: number,
    body: { received_at?: string } = {}
  ): Promise<InvoiceOut> => {
    const { data } = await api.post<InvoiceOut>(
      `/invoices/${id}/mark-received`,
      body
    )
    return data
  },
  unmarkReceived: async (id: number): Promise<InvoiceOut> => {
    const { data } = await api.post<InvoiceOut>(
      `/invoices/${id}/unmark-received`
    )
    return data
  },
  void: async (id: number, voidReason: string): Promise<InvoiceOut> => {
    const { data } = await api.post<InvoiceOut>(`/invoices/${id}/void`, {
      void_reason: voidReason,
    })
    return data
  },
  fetchPdfBlob: async (id: number): Promise<Blob> => {
    const response = await api.get(`/invoices/${id}/pdf`, {
      responseType: 'blob',
    })
    return response.data as Blob
  },
}

/**
 * Downloads the persisted invoice PDF through the authenticated axios client
 * (so the JWT header is attached) and triggers a browser download named after
 * the invoice number.
 */
export async function downloadInvoicePdf(
  id: number,
  number?: string | null
): Promise<void> {
  const blob = await invoicesApi.fetchPdfBlob(id)
  const filename = `${number ?? `invoice-${id}`}.pdf`
  triggerDownload(blob, filename)
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
