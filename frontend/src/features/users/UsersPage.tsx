import { useMemo, useState } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { AlertTriangle, MoreHorizontal, Plus, Users } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/features/auth/AuthContext'
import { usersApi } from '@/lib/api/users'
import type { UserPublic, UserRole } from '@/lib/api/auth'
import { UserFormDialog } from './UserFormDialog'
import { TemporaryPasswordModal } from './TemporaryPasswordModal'

const roleLabel: Record<UserRole, string> = {
  admin: 'Administrador',
  member: 'Membro',
  viewer: 'Visualizador',
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return value
  }
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  return (first + last).toUpperCase() || '?'
}

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UserPublic | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [tempPasswordOpen, setTempPasswordOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<UserPublic | null>(null)

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  })

  const toggleActiveMutation = useMutation({
    mutationFn: (u: UserPublic) =>
      usersApi.update(u.id, { is_active: !u.is_active }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success(
        variables.is_active ? 'Usuário desativado' : 'Usuário ativado'
      )
    },
    onError: (err) => {
      toast.error(extractError(err, 'Falha ao atualizar status.'))
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: (id: number) => usersApi.resetPassword(id),
    onSuccess: (data) => {
      setResetTarget(null)
      setTempPassword(data.temporary_password)
      setTempPasswordOpen(true)
    },
    onError: (err) => {
      toast.error(extractError(err, 'Falha ao resetar senha.'))
    },
  })

  const sortedUsers = useMemo(() => {
    if (!usersQuery.data) return []
    return [...usersQuery.data].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [usersQuery.data])

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(u: UserPublic) {
    setEditing(u)
    setFormOpen(true)
  }

  function handleCreated(password: string) {
    setTempPassword(password)
    setTempPasswordOpen(true)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Users className="h-3 w-3 text-primary" strokeWidth={2.25} />
            <span>Acessos</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Usuários
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie acessos da família ao sistema.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="h-9 transition-shadow hover:shadow-[0_0_24px_-6px_var(--color-primary)]"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo usuário
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
                Email
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Role
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Criado em
              </TableHead>
              <TableHead className="w-[60px] px-4 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="border-b border-border/40">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j} className="px-4 py-3">
                      <div className="h-4 w-full animate-pulse rounded-md bg-muted/60" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : usersQuery.isError ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-destructive">
                  Falha ao carregar usuários.
                </TableCell>
              </TableRow>
            ) : sortedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-muted">
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </div>
                    Nenhum usuário encontrado.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sortedUsers.map((u) => {
                const isSelf = currentUser?.id === u.id
                return (
                  <TableRow
                    key={u.id}
                    className="border-b border-border/40 transition-colors hover:bg-accent/30"
                  >
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                          {userInitials(u.name)}
                        </div>
                        <span className="text-sm font-medium">{u.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-success">
                          <span className="status-dot bg-success status-dot-pulse" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Inativo
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDate(u.created_at)}
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
                          <DropdownMenuItem onSelect={() => openEdit(u)}>
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setResetTarget(u)}
                            disabled={resetPasswordMutation.isPending}
                          >
                            Resetar senha
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => toggleActiveMutation.mutate(u)}
                            disabled={isSelf || toggleActiveMutation.isPending}
                          >
                            {u.is_active ? 'Desativar' : 'Ativar'}
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

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        user={editing}
        onCreated={handleCreated}
      />

      <TemporaryPasswordModal
        open={tempPasswordOpen}
        onOpenChange={(next) => {
          setTempPasswordOpen(next)
          if (!next) setTempPassword(null)
        }}
        password={tempPassword}
      />

      <Dialog
        open={resetTarget !== null}
        onOpenChange={(next) => {
          if (!next) setResetTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md border-border/60 bg-card backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tight">
              Resetar senha
            </DialogTitle>
            <DialogDescription>
              Uma nova senha provisória será gerada e a senha atual será invalidada.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
            <span className="leading-snug">
              {resetTarget
                ? `${resetTarget.name} (${resetTarget.email}) não conseguirá entrar com a senha antiga.`
                : ''}
            </span>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (resetTarget) resetPasswordMutation.mutate(resetTarget.id)
              }}
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? 'Gerando...' : 'Resetar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RoleBadge({ role }: { role: UserRole }) {
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-primary">
        {roleLabel[role]}
      </span>
    )
  }
  if (role === 'member') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-success">
        {roleLabel[role]}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {roleLabel[role]}
    </span>
  )
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
