import { api } from './client'

export type CategoryKind = 'income' | 'expense' | 'transfer'

export type CategoryOut = {
  id: number
  name: string
  kind: CategoryKind
  parent_id: number | null
  icon: string | null
  color: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type CategoryNode = CategoryOut & { children: CategoryNode[] }

export type CategoryCreate = {
  name: string
  kind: CategoryKind
  parent_id?: number | null
  icon?: string
  color?: string
  sort_order?: number
}

export type CategoryUpdate = Partial<{
  name: string
  parent_id: number | null
  icon: string
  color: string
  sort_order: number
}>

export const categoriesApi = {
  list: async (): Promise<CategoryOut[]> => {
    const { data } = await api.get<CategoryOut[]>('/categories')
    return data
  },
  tree: async (kind?: 'income' | 'expense'): Promise<CategoryNode[]> => {
    const { data } = await api.get<CategoryNode[]>('/categories/tree', {
      params: kind ? { kind } : {},
    })
    return data
  },
  create: async (payload: CategoryCreate): Promise<CategoryOut> => {
    const { data } = await api.post<CategoryOut>('/categories', payload)
    return data
  },
  update: async (id: number, payload: CategoryUpdate): Promise<CategoryOut> => {
    const { data } = await api.patch<CategoryOut>(`/categories/${id}`, payload)
    return data
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/categories/${id}`)
  },
}
