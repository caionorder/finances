import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ArchiveRestore,
  Building2,
  Inbox,
  MoreHorizontal,
  Plus,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RoleGate } from '@/features/auth/RoleGate'
import { customersApi, type CustomerOut } from '@/lib/api/customers'
import { cn } from '@/lib/utils'
import { extractError } from '@/features/invoices/utils'
import { CustomerFormDialog } from './CustomerFormDialog'

export function CustomersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerOut | null>(null)

  const query = useQuery({
    queryKey: ['customers', 'list', { search, includeArchived }],
    queryFn: () =>
      customersApi.list({
        q: search || undefined,
        include_archived: includeArchived,
        limit: 200,
      }),
  })

  const items = useMemo(() => query.data?.items ?? [], [query.data])

  const archiveMutation = useMutation({
    mutationFn: (id: number) => customersApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Cliente arquivado')
    },
    onError: (err) => toast.error(extractError(err, 'Falha ao arquivar.')),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: number) =>
      customersApi.update(id, { is_archived: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Cliente restaurado')
    },
    onError: (err) => toast.error(extractError(err, 'Falha ao restaurar.')),
  })

  return (
    <div className="relative space-y-8 animate-fade-in">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 right-16 h-56 w-56 bg-glow-cyan opacity-25"
      />

      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Building2 className="h-3 w-3 text-primary" aria-hidden="true" />
            <span>Comercial</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            Clientes reutilizáveis para invoices e contratos.
          </p>
        </div>
        <RoleGate roles={['admin', 'member']}>
          <Button
            onClick={() => setCreateOpen(true)}
            className="shadow-[0_0_24px_-8px_var(--color-primary)]"
          >
            <Plus className="mr-2 h-4 w-4" strokeWidth={2.25} />
            Novo cliente
          </Button>
        </RoleGate>
      </div>

      <div className="relative flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-soft">
        <div className="relative min-w-[240px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail, tax ID..."
            className="h-9 border-border/80 bg-background/50 pl-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="cust-archived"
            checked={includeArchived}
            onCheckedChange={(v) => setIncludeArchived(Boolean(v))}
          />
          <Label htmlFor="cust-archived" className="cursor-pointer text-xs text-muted-foreground">
            Incluir arquivados
          </Label>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">
                Razão social
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">
                Contato
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">
                Cidade / País
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest">
                Tax ID
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border/40">
                  <TableCell colSpan={5} className="py-3">
                    <div className="h-6 animate-pulse rounded bg-muted/50" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Inbox className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Nenhum cliente
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((c) => (
                <TableRow
                  key={c.id}
                  className={cn(
                    'border-border/40',
                    c.is_archived && 'opacity-55'
                  )}
                >
                  <TableCell className="text-sm font-medium">
                    <div className="flex items-center gap-2">
                      {c.legal_name}
                      {c.is_archived ? (
                        <span className="rounded border border-border bg-muted/40 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                          Arquivado
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.contact_person || c.email || '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.billing_city}
                    {c.billing_country ? ` · ${c.billing_country}` : ''}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {c.tax_id || '—'}
                  </TableCell>
                  <TableCell>
                    <RoleGate roles={['admin', 'member']}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Ações"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="border-border/60">
                          <DropdownMenuItem onSelect={() => setEditing(c)}>
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {c.is_archived ? (
                            <DropdownMenuItem
                              onSelect={() => restoreMutation.mutate(c.id)}
                            >
                              <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                              Restaurar
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onSelect={() => archiveMutation.mutate(c.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Archive className="mr-2 h-3.5 w-3.5" />
                              Arquivar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </RoleGate>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CustomerFormDialog
        open={createOpen || editing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCreateOpen(false)
            setEditing(null)
          }
        }}
        customer={editing}
      />
    </div>
  )
}
