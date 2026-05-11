import { useMemo, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { KeyRound, MoreHorizontal, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { apiKeysApi, type ApiKeyOut } from '@/lib/api/apiKeys'
import { ApiKeyFormDialog } from './ApiKeyFormDialog'
import { TokenRevealModal } from './TokenRevealModal'
import { RevokeKeyDialog } from './RevokeKeyDialog'

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return value
  }
}

function formatLastUsed(value: string | null): string {
  if (!value) return 'Nunca usada'
  try {
    return `há ${formatDistanceToNow(new Date(value), { locale: ptBR })}`
  } catch {
    return value
  }
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
    if (err.response?.status === 409) return 'Já existe uma chave com este nome.'
  }
  return fallback
}

type RevealedToken = { token: string; name: string } | null

export function ApiKeysSection() {
  const queryClient = useQueryClient()

  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<RevealedToken>(null)
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyOut | null>(null)

  const keysQuery = useQuery({
    queryKey: ['api-keys'],
    queryFn: apiKeysApi.list,
  })

  const createMutation = useMutation({
    mutationFn: ({ name, scopes }: { name: string; scopes: string[] }) =>
      apiKeysApi.create(name, scopes),
    onSuccess: (data) => {
      setFormOpen(false)
      setRevealed({ token: data.plain_key, name: data.name })
    },
    onError: (err) => {
      setFormError(extractError(err, 'Não foi possível criar a chave.'))
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (id: number) => apiKeysApi.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('Chave revogada')
      setRevokeTarget(null)
    },
    onError: (err) => {
      toast.error(extractError(err, 'Falha ao revogar chave.'))
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: number) => apiKeysApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('Chave excluída')
    },
    onError: (err) => {
      toast.error(extractError(err, 'Falha ao excluir chave.'))
    },
  })

  const sortedKeys = useMemo(() => {
    if (!keysQuery.data) return []
    return [...keysQuery.data].sort((a, b) => {
      const aActive = a.revoked_at === null ? 0 : 1
      const bActive = b.revoked_at === null ? 0 : 1
      if (aActive !== bActive) return aActive - bActive
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [keysQuery.data])

  function handleTokenModalChange(next: boolean) {
    if (!next) {
      setRevealed(null)
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <KeyRound className="h-3 w-3 text-primary" strokeWidth={2.25} />
            <span>Integrações</span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Chaves de API</h2>
          <p className="text-sm text-muted-foreground">
            Use chaves de API para integrações externas. Cada chave é mostrada
            apenas uma vez no momento da criação — guarde em local seguro.
          </p>
        </div>
        <Button
          onClick={() => setFormOpen(true)}
          className="h-9 transition-shadow hover:shadow-[0_0_24px_-6px_var(--color-primary)]"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova chave
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-b border-border/60 hover:bg-transparent">
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Nome
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Scopes
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Criada em
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Última utilização
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="w-[60px] px-4 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keysQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="border-b border-border/40">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded-md bg-muted/60" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : keysQuery.isError ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-destructive">
                  Falha ao carregar chaves.
                </TableCell>
              </TableRow>
            ) : sortedKeys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-muted">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                    </div>
                    Nenhuma chave criada ainda.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sortedKeys.map((key) => {
                const isRevoked = key.revoked_at !== null
                return (
                  <TableRow
                    key={key.id}
                    className="border-b border-border/40 transition-colors hover:bg-accent/30"
                  >
                    <TableCell className="px-4 py-3 text-sm font-medium">
                      {key.name}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {key.scopes.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            sem scopes
                          </span>
                        ) : (
                          key.scopes.map((scope) => (
                            <span
                              key={scope}
                              className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-primary"
                            >
                              {scope}
                            </span>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDate(key.created_at)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                      {formatLastUsed(key.last_used_at)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {isRevoked ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Revogada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-success">
                          <span className="status-dot bg-success status-dot-pulse" />
                          Ativa
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Ações"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setRevokeTarget(key)}
                            disabled={isRevoked || revokeMutation.isPending}
                          >
                            Revogar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => removeMutation.mutate(key.id)}
                            disabled={removeMutation.isPending}
                            variant="destructive"
                          >
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ApiKeyFormDialog
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next)
          if (!next) setFormError(null)
        }}
        pending={createMutation.isPending}
        serverError={formError}
        onClearError={() => setFormError(null)}
        onSubmit={(values) => {
          setFormError(null)
          createMutation.mutate(values)
        }}
      />

      <TokenRevealModal
        open={revealed !== null}
        onOpenChange={handleTokenModalChange}
        token={revealed?.token ?? null}
        keyName={revealed?.name ?? null}
      />

      <RevokeKeyDialog
        open={revokeTarget !== null}
        onOpenChange={(next) => {
          if (!next) setRevokeTarget(null)
        }}
        keyName={revokeTarget?.name ?? null}
        pending={revokeMutation.isPending}
        onConfirm={() => {
          if (revokeTarget) revokeMutation.mutate(revokeTarget.id)
        }}
      />
    </div>
  )
}
