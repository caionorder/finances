import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CategoryOut } from '@/lib/api/categories'
import {
  purchasesApi,
  type PurchaseFilters,
  type PurchaseOut,
} from '@/lib/api/purchases'
import { PurchaseTable } from './PurchaseTable'

type Props = {
  cardId: number
  currencyCode: string
  categoriesById: Map<number, CategoryOut>
  canEdit: boolean
  onEdit: (p: PurchaseOut) => void
  onDelete: (p: PurchaseOut) => void
  cardNamesById?: Map<number, string>
}

const labelClass = 'text-[10px] font-medium uppercase tracking-widest text-muted-foreground'
const inputClass = 'h-9 border-border/80 bg-background/50 transition-colors focus:border-primary'

export function PurchasesAllInfinite({
  cardId,
  currencyCode,
  categoriesById,
  canEdit,
  onEdit,
  onDelete,
  cardNamesById,
}: Props) {
  const [filters, setFilters] = useState<PurchaseFilters>({})
  const [search, setSearch] = useState('')

  useEffect(() => {
    const handle = setTimeout(() => {
      const trimmed = search.trim()
      if ((filters.search ?? '') === trimmed) return
      setFilters((prev) => ({ ...prev, search: trimmed || undefined }))
    }, 300)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const query = useInfiniteQuery({
    queryKey: ['purchases', cardId, 'all', filters],
    queryFn: ({ pageParam }) =>
      purchasesApi.list(cardId, {
        ...filters,
        cursor: pageParam,
        limit: 50,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  })

  const items = useMemo(() => {
    if (!query.data) return []
    return query.data.pages.flatMap((p) => p.items)
  }, [query.data])

  const hasFilters =
    !!filters.date_from || !!filters.date_to || !!filters.search

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-soft">
        <div className="space-y-1">
          <Label className={labelClass}>De</Label>
          <Input
            type="date"
            value={filters.date_from ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                date_from: e.target.value || undefined,
              }))
            }
            className={`${inputClass} w-[150px] font-mono`}
          />
        </div>
        <div className="space-y-1">
          <Label className={labelClass}>Até</Label>
          <Input
            type="date"
            value={filters.date_to ?? ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                date_to: e.target.value || undefined,
              }))
            }
            className={`${inputClass} w-[150px] font-mono`}
          />
        </div>
        <div className="min-w-[220px] flex-1 space-y-1">
          <Label className={labelClass}>Buscar descrição</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar..."
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>
        {hasFilters ? (
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              setSearch('')
              setFilters({})
            }}
            className="h-9"
          >
            <X className="mr-2 h-4 w-4" />
            Limpar
          </Button>
        ) : null}
      </div>

      <PurchaseTable
        purchases={items}
        categoriesById={categoriesById}
        currencyCode={currencyCode}
        isLoading={query.isLoading}
        canEdit={canEdit}
        onEdit={onEdit}
        onDelete={onDelete}
        emptyMessage="Nenhuma compra registrada neste cartão."
        showFooterTotal={false}
        currentCardId={cardId}
        cardNamesById={cardNamesById}
      />

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? 'Carregando...' : 'Carregar mais'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
