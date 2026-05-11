import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { accountsApi } from '@/lib/api/accounts'
import { categoriesApi, type CategoryOut } from '@/lib/api/categories'
import type {
  TransactionFilters as Filters,
  TransactionKind,
} from '@/lib/api/transactions'

const ALL = '__all__'

type Props = {
  value: Filters
  onChange: (next: Filters) => void
}

const labelClass = 'text-[10px] font-medium uppercase tracking-widest text-muted-foreground'
const inputClass = 'h-9 border-border/80 bg-background/50 transition-colors focus:border-primary'

export function TransactionFilters({ value, onChange }: Props) {
  const [search, setSearch] = useState(value.search ?? '')

  useEffect(() => {
    setSearch(value.search ?? '')
  }, [value.search])

  useEffect(() => {
    const handle = setTimeout(() => {
      const trimmed = search.trim()
      if ((value.search ?? '') === trimmed) return
      onChange({ ...value, search: trimmed || undefined })
    }, 300)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: false }],
    queryFn: () => accountsApi.list(false),
  })

  const categoriesQuery = useQuery({
    queryKey: ['categories', 'list-all'],
    queryFn: () => categoriesApi.list(),
  })

  const accounts = accountsQuery.data ?? []
  const categories = categoriesQuery.data ?? []
  const incomeCats = categories.filter((c) => c.kind === 'income')
  const expenseCats = categories.filter((c) => c.kind === 'expense')

  const hasFilters =
    value.account_id !== undefined ||
    value.kind !== undefined ||
    value.category_id !== undefined ||
    !!value.date_from ||
    !!value.date_to ||
    !!value.search

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-soft">
      <div className="min-w-[180px] flex-1 space-y-1">
        <Label className={labelClass}>Conta</Label>
        <Select
          value={value.account_id ? String(value.account_id) : ALL}
          onValueChange={(v) =>
            onChange({
              ...value,
              account_id: v === ALL ? undefined : Number(v),
            })
          }
        >
          <SelectTrigger className={inputClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
                {a.is_archived ? ' (arquivada)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-[160px] flex-1 space-y-1">
        <Label className={labelClass}>Tipo</Label>
        <Select
          value={value.kind ?? ALL}
          onValueChange={(v) =>
            onChange({
              ...value,
              kind: v === ALL ? undefined : (v as TransactionKind),
            })
          }
        >
          <SelectTrigger className={inputClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            <SelectItem value="income">Receita</SelectItem>
            <SelectItem value="expense">Despesa</SelectItem>
            <SelectItem value="transfer">Transferência</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-[200px] flex-1 space-y-1">
        <Label className={labelClass}>Categoria</Label>
        <Select
          value={value.category_id ? String(value.category_id) : ALL}
          onValueChange={(v) =>
            onChange({
              ...value,
              category_id: v === ALL ? undefined : Number(v),
            })
          }
        >
          <SelectTrigger className={inputClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas</SelectItem>
            {expenseCats.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Despesas</SelectLabel>
                {sortCats(expenseCats).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {incomeCats.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Receitas</SelectLabel>
                {sortCats(incomeCats).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className={labelClass}>De</Label>
        <Input
          type="date"
          value={value.date_from ?? ''}
          onChange={(e) =>
            onChange({ ...value, date_from: e.target.value || undefined })
          }
          className={`${inputClass} w-[150px] font-mono`}
        />
      </div>

      <div className="space-y-1">
        <Label className={labelClass}>Até</Label>
        <Input
          type="date"
          value={value.date_to ?? ''}
          onChange={(e) =>
            onChange({ ...value, date_to: e.target.value || undefined })
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
            onChange({})
          }}
          className="h-9"
        >
          <X className="mr-2 h-4 w-4" />
          Limpar
        </Button>
      ) : null}
    </div>
  )
}

function sortCats(cats: CategoryOut[]): CategoryOut[] {
  return [...cats].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}
