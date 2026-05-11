import { api } from './client'

export type FacturaType = 'received' | 'issued'

export type FacturaOut = {
  id: number
  type: FacturaType
  number: string
  ruc: string
  supplier_name: string
  date: string
  total: string
  iva_5: string
  iva_10: string
  exempt: string
  currency_code: string
  category_id: number | null
  notes: string | null
  file_path: string | null
  file_mime: string | null
  file_size: number | null
  has_file: boolean
  created_at: string
  updated_at: string
}

export type FacturaListResponse = {
  items: FacturaOut[]
  next_cursor: string | null
  limit: number
}

export type FacturaListParams = {
  type?: FacturaType
  from?: string
  to?: string
  supplier?: string
  search?: string
  cursor?: string | null
  limit?: number
}

function buildParams(params: FacturaListParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (params.type) out.type = params.type
  if (params.from) out.from = params.from
  if (params.to) out.to = params.to
  if (params.supplier) out.supplier = params.supplier
  if (params.search) out.search = params.search
  if (params.cursor) out.cursor = params.cursor
  if (params.limit !== undefined) out.limit = params.limit
  return out
}

export const facturasApi = {
  list: async (params: FacturaListParams = {}): Promise<FacturaListResponse> => {
    const { data } = await api.get<FacturaListResponse>('/facturas', {
      params: buildParams(params),
    })
    return data
  },
  get: async (id: number): Promise<FacturaOut> => {
    const { data } = await api.get<FacturaOut>(`/facturas/${id}`)
    return data
  },
  create: async (formData: FormData): Promise<FacturaOut> => {
    const { data } = await api.post<FacturaOut>('/facturas', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  update: async (id: number, formData: FormData): Promise<FacturaOut> => {
    const { data } = await api.patch<FacturaOut>(`/facturas/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/facturas/${id}`)
  },
  fetchFileBlob: async (id: number): Promise<Blob> => {
    const response = await api.get(`/facturas/${id}/download`, {
      responseType: 'blob',
    })
    return response.data as Blob
  },
  fetchExportZip: async (
    month: string,
    type: 'received' | 'issued' | 'all' = 'all'
  ): Promise<Blob> => {
    const response = await api.get('/facturas/export', {
      params: { month, type },
      responseType: 'blob',
    })
    return response.data as Blob
  },
}

export async function downloadFacturaFile(
  id: number,
  filename: string
): Promise<void> {
  const blob = await facturasApi.fetchFileBlob(id)
  triggerDownload(blob, filename)
}

export async function exportFacturasZip(
  month: string,
  type: 'received' | 'issued' | 'all' = 'all'
): Promise<void> {
  const blob = await facturasApi.fetchExportZip(month, type)
  triggerDownload(blob, `facturas-${month}-${type}.zip`)
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
