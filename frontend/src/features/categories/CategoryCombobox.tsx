import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { categoriesApi, type CategoryOut } from '@/lib/api/categories'

type Props = {
  value: number | null | undefined
  onChange: (next: number | null) => void
  /** 'income' | 'expense' (filtra opções e separa em grupos) */
  kind?: 'income' | 'expense'
  placeholder?: string
  emptyMessage?: string
  disabled?: boolean
  className?: string
  /** Permite o usuário limpar a seleção (mostra "Sem categoria") */
  clearable?: boolean
}

type FlatNode = {
  category: CategoryOut
  level: number
  parents: CategoryOut[]
  /** Lista de tokens (nome próprio + nomes dos pais) pra busca por substring */
  searchHaystack: string
}

function flattenTree(roots: CategoryOut[]): FlatNode[] {
  const byParent = new Map<number | null, CategoryOut[]>()
  for (const c of roots) {
    const arr = byParent.get(c.parent_id ?? null) ?? []
    arr.push(c)
    byParent.set(c.parent_id ?? null, arr)
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => {
      const so = (a.sort_order ?? 0) - (b.sort_order ?? 0)
      if (so !== 0) return so
      return a.name.localeCompare(b.name, 'pt-BR')
    })
  }

  const out: FlatNode[] = []
  function walk(parentId: number | null, level: number, ancestors: CategoryOut[]) {
    const items = byParent.get(parentId) ?? []
    for (const c of items) {
      const parents = ancestors
      const haystack = [c.name, ...parents.map((p) => p.name)]
        .join(' ')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
      out.push({ category: c, level, parents, searchHaystack: haystack })
      walk(c.id, level + 1, [...parents, c])
    }
  }
  walk(null, 0, [])
  return out
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function CategoryCombobox({
  value,
  onChange,
  kind,
  placeholder = 'Selecione uma categoria',
  emptyMessage = 'Nenhuma categoria encontrada',
  disabled = false,
  className,
  clearable = true,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const categoriesQuery = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => categoriesApi.list(),
    staleTime: 5 * 60_000,
  })

  const all = categoriesQuery.data ?? []

  const filtered = useMemo(() => {
    if (!kind) return all
    return all.filter((c) => c.kind === kind)
  }, [all, kind])

  const flat = useMemo(() => flattenTree(filtered), [filtered])

  const visibleNodes = useMemo(() => {
    const q = normalize(search.trim())
    if (!q) return flat
    return flat.filter((n) => n.searchHaystack.includes(q))
  }, [flat, search])

  const selected = value != null ? all.find((c) => c.id === value) : null
  const selectedParents = useMemo(() => {
    if (!selected) return [] as CategoryOut[]
    const parents: CategoryOut[] = []
    let cur: CategoryOut | undefined = selected
    while (cur && cur.parent_id != null) {
      const p = all.find((c) => c.id === cur!.parent_id)
      if (!p) break
      parents.unshift(p)
      cur = p
    }
    return parents
  }, [selected, all])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || categoriesQuery.isLoading}
          className={cn(
            'h-10 w-full justify-between border-border/80 bg-background/50 px-3 font-normal transition-colors focus:border-primary',
            !selected && 'text-muted-foreground',
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate text-left">
            {selected ? (
              <>
                {selectedParents.length > 0 && (
                  <span className="truncate text-xs text-muted-foreground">
                    {selectedParents.map((p) => p.name).join(' › ')} ›
                  </span>
                )}
                <span className="truncate font-medium text-foreground">
                  {selected.name}
                </span>
              </>
            ) : categoriesQuery.isLoading ? (
              'Carregando…'
            ) : (
              placeholder
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {clearable && selected && !disabled ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="Limpar categoria"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onChange(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onChange(null)
                  }
                }}
                className="grid h-5 w-5 cursor-pointer place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            ) : null}
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] border-border/60 bg-popover p-0 shadow-pop"
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={false} className="border-0 bg-transparent">
          <div className="flex items-center gap-2 border-b border-border/40 px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <CommandInput
              placeholder="Buscar categoria…"
              value={search}
              onValueChange={setSearch}
              className="h-10 border-0 bg-transparent px-0 focus-visible:ring-0"
            />
          </div>
          <CommandList className="max-h-72">
            {visibleNodes.length === 0 ? (
              <CommandEmpty className="py-8 text-center text-xs text-muted-foreground">
                {emptyMessage}
              </CommandEmpty>
            ) : null}
            {clearable && !search ? (
              <>
                <CommandGroup>
                  <CommandItem
                    value="__none__"
                    onSelect={() => {
                      onChange(null)
                      setOpen(false)
                      setSearch('')
                    }}
                    className="gap-2 text-sm"
                  >
                    <span
                      className={cn(
                        'inline-flex h-4 w-4 items-center justify-center rounded-sm border',
                        value == null
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border'
                      )}
                    >
                      {value == null ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                      Sem categoria
                    </span>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}
            <CommandGroup>
              {visibleNodes.map(({ category: c, level, parents }) => {
                const isSelected = c.id === value
                const breadcrumb = parents.map((p) => p.name).join(' › ')
                return (
                  <CommandItem
                    key={c.id}
                    value={`${c.id}`}
                    onSelect={() => {
                      onChange(c.id)
                      setOpen(false)
                      setSearch('')
                    }}
                    className="gap-2 text-sm"
                    style={{ paddingLeft: `${12 + level * 14}px` }}
                  >
                    <span
                      className={cn(
                        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border'
                      )}
                    >
                      {isSelected ? <Check className="h-3 w-3" /> : null}
                    </span>
                    {c.color ? (
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: c.color,
                          boxShadow: `0 0 6px ${c.color}`,
                        }}
                      />
                    ) : null}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{c.name}</span>
                      {breadcrumb && search ? (
                        <span className="truncate text-[10px] text-muted-foreground">
                          {breadcrumb}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
