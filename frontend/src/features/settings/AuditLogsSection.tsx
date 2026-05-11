import { useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, History, Inbox, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { auditLogsApi, type AuditLogOut } from '@/lib/api/auditLogs'
import { usersApi } from '@/lib/api/users'
import { cn } from '@/lib/utils'

const ALL = '__all__'

type Filters = {
  action: string
  entity: string
  user_id: string
  from_date: string
  to_date: string
}

const EMPTY_FILTERS: Filters = {
  action: ALL,
  entity: ALL,
  user_id: ALL,
  from_date: '',
  to_date: '',
}

function buildQueryParams(f: Filters) {
  return {
    action: f.action !== ALL ? f.action : undefined,
    entity: f.entity !== ALL ? f.entity : undefined,
    user_id: f.user_id !== ALL ? Number(f.user_id) : undefined,
    from_date: f.from_date || undefined,
    to_date: f.to_date || undefined,
  }
}

export function AuditLogsSection() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const queryParams = useMemo(() => buildQueryParams(filters), [filters])

  const usersQuery = useQuery({
    queryKey: ['users', 'list-for-audit'],
    queryFn: () => usersApi.list(),
    staleTime: 5 * 60_000,
  })

  const logsQuery = useInfiniteQuery({
    queryKey: ['audit-logs', queryParams],
    queryFn: async ({ pageParam }) =>
      auditLogsApi.list({
        ...queryParams,
        cursor: pageParam,
        limit: 50,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  })

  const allItems = useMemo(
    () => logsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [logsQuery.data]
  )

  // Action/entity options derived from currently-loaded items.
  // Falls back to a stable seed list if nothing loaded yet.
  const seenActions = useMemo(() => {
    const s = new Set<string>(SEED_ACTIONS)
    for (const it of allItems) s.add(it.action)
    return Array.from(s).sort()
  }, [allItems])

  const seenEntities = useMemo(() => {
    const s = new Set<string>(SEED_ENTITIES)
    for (const it of allItems) s.add(it.entity)
    return Array.from(s).sort()
  }, [allItems])

  function reset() {
    setFilters(EMPTY_FILTERS)
  }

  const hasFilters =
    filters.action !== ALL ||
    filters.entity !== ALL ||
    filters.user_id !== ALL ||
    filters.from_date !== '' ||
    filters.to_date !== ''

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <History className="h-3 w-3 text-primary" strokeWidth={2.25} />
            <span>Auditoria</span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Trilha de auditoria</h2>
          <p className="text-sm text-muted-foreground">
            Registro de ações dos usuários no sistema. Apenas leitura — somente
            administradores têm acesso.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => logsQuery.refetch()}
          disabled={logsQuery.isFetching}
          className="h-9 border-border/80"
        >
          <RotateCw
            className={cn(
              'mr-2 h-3.5 w-3.5',
              logsQuery.isFetching && 'animate-spin'
            )}
            strokeWidth={2.25}
          />
          Recarregar
        </Button>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-3 shadow-soft">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label>Ação</Label>
            <Select
              value={filters.action}
              onValueChange={(v) => setFilters((f) => ({ ...f, action: v }))}
            >
              <SelectTrigger className="h-9 border-border/80 bg-background/50 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {seenActions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Entidade</Label>
            <Select
              value={filters.entity}
              onValueChange={(v) => setFilters((f) => ({ ...f, entity: v }))}
            >
              <SelectTrigger className="h-9 border-border/80 bg-background/50 font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas</SelectItem>
                {seenEntities.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Usuário</Label>
            <Select
              value={filters.user_id}
              onValueChange={(v) => setFilters((f) => ({ ...f, user_id: v }))}
            >
              <SelectTrigger className="h-9 border-border/80 bg-background/50 text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {(usersQuery.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>De</Label>
            <Input
              type="date"
              value={filters.from_date}
              onChange={(e) =>
                setFilters((f) => ({ ...f, from_date: e.target.value }))
              }
              className="h-9 border-border/80 bg-background/50 font-mono tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Até</Label>
            <Input
              type="date"
              value={filters.to_date}
              onChange={(e) =>
                setFilters((f) => ({ ...f, to_date: e.target.value }))
              }
              className="h-9 border-border/80 bg-background/50 font-mono tabular-nums"
            />
          </div>
        </div>
        {hasFilters ? (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={reset} className="h-8 text-xs">
              Limpar filtros
            </Button>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-b border-border/60 hover:bg-transparent">
              <TableHead className="w-[160px] px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Quando
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Usuário
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Ação
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Entidade
              </TableHead>
              <TableHead className="w-[80px] px-4 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                ID
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Payload
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logsQuery.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="border-b border-border/40">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded-md bg-muted/60" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : logsQuery.isError ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <div className="space-y-2 text-sm">
                    <p className="text-destructive">Falha ao carregar logs.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => logsQuery.refetch()}
                    >
                      Tentar novamente
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : allItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-muted">
                      <Inbox className="h-4 w-4 text-muted-foreground" />
                    </div>
                    Nenhum log encontrado para os filtros selecionados.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              allItems.map((log) => <AuditLogRow key={log.id} log={log} />)
            )}
          </TableBody>
        </Table>
        {logsQuery.hasNextPage ? (
          <div className="border-t border-border/40 px-4 py-3 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => logsQuery.fetchNextPage()}
              disabled={logsQuery.isFetchingNextPage}
              className="border-border/80"
            >
              {logsQuery.isFetchingNextPage
                ? 'Carregando...'
                : 'Carregar mais'}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  )
}

function AuditLogRow({ log }: { log: AuditLogOut }) {
  const [open, setOpen] = useState(false)
  const hasPayload =
    log.payload_json !== null &&
    log.payload_json !== undefined &&
    Object.keys(log.payload_json).length > 0

  return (
    <>
      <TableRow className="border-b border-border/40 transition-colors hover:bg-accent/30">
        <TableCell className="px-4 py-3 font-mono text-xs tabular-nums text-muted-foreground">
          {formatDateTime(log.created_at)}
        </TableCell>
        <TableCell className="px-4 py-3 text-sm">
          {log.user_email ?? (
            <span className="text-muted-foreground">sistema</span>
          )}
        </TableCell>
        <TableCell className="px-4 py-3">
          <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-primary">
            {log.action}
          </span>
        </TableCell>
        <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">
          {log.entity}
        </TableCell>
        <TableCell className="px-4 py-3 text-right font-mono text-xs tabular-nums text-muted-foreground">
          {log.entity_id ?? '—'}
        </TableCell>
        <TableCell className="px-4 py-3">
          {hasPayload ? (
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                >
                  {open ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {open ? 'Ocultar' : 'Ver'}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
      </TableRow>
      {hasPayload && open ? (
        <TableRow className="border-b border-border/40 bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={6} className="px-4 py-3">
            <pre className="max-h-72 overflow-auto rounded-md border border-border/40 bg-background/80 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
              {JSON.stringify(log.payload_json, null, 2)}
            </pre>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

const SEED_ACTIONS = [
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'mark_as_paid',
  'mark_as_received',
  'unmark_as_paid',
  'unmark_as_received',
  'manual_balance_adjustment',
  'payable_notification_sent',
  'api_key_created',
  'api_key_revoked',
]

const SEED_ENTITIES = [
  'account',
  'api_key',
  'category',
  'credit_card',
  'credit_card_purchase',
  'facturas',
  'investment',
  'payable',
  'receivable',
  'recurrence',
  'transaction',
  'user',
]
