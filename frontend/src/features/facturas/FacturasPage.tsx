import { useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  Download,
  FileText,
  MoreHorizontal,
  Paperclip,
  Plus,
  Receipt,
  Search,
} from 'lucide-react'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { categoriesApi } from '@/lib/api/categories'
import {
  exportFacturasZip,
  facturasApi,
  type FacturaListParams,
  type FacturaOut,
  type FacturaType,
} from '@/lib/api/facturas'
import { formatCurrency } from '@/lib/currency'
import { useDebounce } from './useDebounce'
import { FacturaFormDialog } from './FacturaFormDialog'
import { FacturaDetailDialog } from './FacturaDetailDialog'

const ALL = '__all__'

type TypeFilter = 'all' | FacturaType

type MonthOption = {
  value: string
  label: string
  from: string
  to: string
}

export function FacturasPage() {
  const monthOptions = useMemo(buildMonthOptions, [])
  const [monthValue, setMonthValue] = useState<string>(monthOptions[0].value)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, 300)

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<FacturaOut | null>(null)
  const [detail, setDetail] = useState<FacturaOut | null>(null)
  const [exporting, setExporting] = useState(false)

  const selectedMonth = useMemo(
    () => monthOptions.find((m) => m.value === monthValue) ?? monthOptions[0],
    [monthOptions, monthValue]
  )

  const categoriesQuery = useQuery({
    queryKey: ['categories', 'list-all'],
    queryFn: () => categoriesApi.list(),
  })

  const categoryMap = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of categoriesQuery.data ?? []) m.set(c.id, c.name)
    return m
  }, [categoriesQuery.data])

  const filters: FacturaListParams = useMemo(() => {
    const trimmed = debouncedSearch.trim()
    return {
      from: selectedMonth.from,
      to: selectedMonth.to,
      type: typeFilter === 'all' ? undefined : typeFilter,
      search: trimmed || undefined,
      limit: 50,
    }
  }, [selectedMonth, typeFilter, debouncedSearch])

  const listQuery = useInfiniteQuery({
    queryKey: ['facturas', filters],
    queryFn: ({ pageParam }) =>
      facturasApi.list({ ...filters, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  })

  const items = useMemo(() => {
    if (!listQuery.data) return []
    return listQuery.data.pages.flatMap((p) => p.items)
  }, [listQuery.data])

  async function handleExport() {
    setExporting(true)
    try {
      const exportType = typeFilter
      await exportFacturasZip(selectedMonth.value, exportType)
      toast.success('Exportação iniciada')
    } catch (err) {
      toast.error(extractError(err, 'Falha ao exportar facturas.'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Receipt className="h-3 w-3 text-primary" strokeWidth={2.25} />
            <span>Facturas (PY)</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Facturas paraguaias
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastre facturas recebidas e emitidas em guaranis (PYG) com anexo digital.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={exporting} className="h-9">
            <Download className="mr-2 h-4 w-4" />
            {exporting ? 'Exportando...' : 'Exportar mês'}
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            className="h-9 transition-shadow hover:shadow-[0_0_24px_-6px_var(--color-primary)]"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova factura
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-soft">
        <div className="space-y-1">
          <span className="block font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Mês
          </span>
          <Select value={monthValue} onValueChange={setMonthValue}>
            <SelectTrigger className="h-9 w-[180px] border-border/60 font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value} className="font-mono">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <span className="block font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Tipo
          </span>
          <Select
            value={typeFilter === 'all' ? ALL : typeFilter}
            onValueChange={(v) =>
              setTypeFilter(v === ALL ? 'all' : (v as FacturaType))
            }
          >
            <SelectTrigger className="h-9 w-[160px] border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              <SelectItem value="received">Recebidas</SelectItem>
              <SelectItem value="issued">Emitidas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[260px] flex-1 space-y-1">
          <span className="block font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Buscar
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Número, RUC ou fornecedor..."
              className="h-9 border-border/60 pl-8"
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-b border-border/60 hover:bg-transparent">
              <TableHead className="w-[110px] px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Tipo
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Número
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                RUC
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Fornecedor
              </TableHead>
              <TableHead className="w-[110px] px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Data
              </TableHead>
              <TableHead className="px-4 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Total
              </TableHead>
              <TableHead className="w-[64px] px-4 py-3 text-center font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Anexo
              </TableHead>
              <TableHead className="w-[64px] px-4 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="border-b border-border/40">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded-md bg-muted/60" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : listQuery.isError ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-destructive">
                  Falha ao carregar facturas.
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-muted">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                    </div>
                    Nenhuma factura encontrada.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((f) => (
                <TableRow
                  key={f.id}
                  className="cursor-pointer border-b border-border/40 transition-colors hover:bg-accent/30"
                  onClick={() => setDetail(f)}
                >
                  <TableCell className="px-4 py-3">
                    <TypeBadge type={f.type} />
                  </TableCell>
                  <TableCell className="px-4 py-3 font-mono text-xs tabular-nums">
                    {f.number}
                  </TableCell>
                  <TableCell className="px-4 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                    {f.ruc}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate px-4 py-3 text-sm">
                    {f.supplier_name}
                  </TableCell>
                  <TableCell className="px-4 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatDate(f.date)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right font-mono text-sm font-medium tabular-nums">
                    {formatCurrency(f.total, f.currency_code)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {f.has_file ? (
                      <Paperclip
                        className="mx-auto h-4 w-4 text-primary"
                        strokeWidth={2.25}
                        aria-label="Com anexo"
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="px-4 py-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Ações" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDetail(f)}>
                          <FileText className="mr-2 h-4 w-4" />
                          Ver detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setEditing(f)}>
                          Editar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {listQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => listQuery.fetchNextPage()}
            disabled={listQuery.isFetchingNextPage}
          >
            {listQuery.isFetchingNextPage ? 'Carregando...' : 'Carregar mais'}
          </Button>
        </div>
      ) : null}

      <FacturaFormDialog
        open={createOpen || editing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCreateOpen(false)
            setEditing(null)
          }
        }}
        factura={editing}
      />

      <FacturaDetailDialog
        factura={detail}
        onClose={() => setDetail(null)}
        onEdit={(f) => {
          setDetail(null)
          setEditing(f)
        }}
        categoryMap={categoryMap}
      />
    </div>
  )
}

function TypeBadge({ type }: { type: FacturaType }) {
  if (type === 'issued') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-primary">
        Emitida
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-success">
      Recebida
    </span>
  )
}

function buildMonthOptions(): MonthOption[] {
  const options: MonthOption[] = []
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    month: '2-digit',
    year: 'numeric',
  })
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const value = `${y}-${String(m).padStart(2, '0')}`
    const from = `${value}-01`
    const last = new Date(y, m, 0).getDate()
    const to = `${value}-${String(last).padStart(2, '0')}`
    options.push({ value, label: formatter.format(d), from, to })
  }
  return options
}

function formatDate(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
