import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'
import { Shield } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/features/auth/AuthContext'
import {
  creditCardsApi,
  type CreditCardWithSummary,
} from '@/lib/api/creditCards'
import { usersApi } from '@/lib/api/users'
import type { UserPublic } from '@/lib/api/auth'

type Permission = 'none' | 'read' | 'write'

const PERM_LABEL: Record<Permission, string> = {
  none: 'Sem acesso',
  read: 'Leitura',
  write: 'Escrita',
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  card: CreditCardWithSummary | null
}

export function CreditCardAclDialog({ open, onOpenChange, card }: Props) {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [perms, setPerms] = useState<Map<number, Permission>>(new Map())
  const [serverError, setServerError] = useState<string | null>(null)

  const cardId = card?.id

  const results = useQueries({
    queries: [
      {
        queryKey: ['users'],
        queryFn: usersApi.list,
        enabled: open,
      },
      {
        queryKey: ['credit-card-acls', cardId],
        queryFn: () => creditCardsApi.listAcls(cardId as number),
        enabled: open && typeof cardId === 'number',
      },
    ],
  })

  const usersQuery = results[0]
  const aclsQuery = results[1]

  const users = usersQuery.data as UserPublic[] | undefined

  useEffect(() => {
    if (!open || !aclsQuery.data) return
    const map = new Map<number, Permission>()
    for (const a of aclsQuery.data) map.set(a.user_id, a.permission)
    setPerms(map)
  }, [open, aclsQuery.data])

  useEffect(() => {
    if (!open) setServerError(null)
  }, [open])

  const eligibleUsers = useMemo(() => {
    if (!users) return []
    return users
      .filter(
        (u) => u.role !== 'admin' && u.is_active && u.id !== currentUser?.id
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [users, currentUser?.id])

  const saveMutation = useMutation({
    mutationFn: () => {
      if (typeof cardId !== 'number') return Promise.resolve([])
      const payload: { user_id: number; permission: 'read' | 'write' }[] = []
      for (const [userId, perm] of perms) {
        if (perm === 'read' || perm === 'write') {
          payload.push({ user_id: userId, permission: perm })
        }
      }
      return creditCardsApi.setAcls(cardId, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-card-acls', cardId] })
      queryClient.invalidateQueries({ queryKey: ['credit-cards'] })
      toast.success('Acessos atualizados')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Falha ao salvar acessos.'))
    },
  })

  function setPerm(userId: number, perm: Permission) {
    setPerms((prev) => {
      const next = new Map(prev)
      next.set(userId, perm)
      return next
    })
  }

  const isLoading = usersQuery.isLoading || aclsQuery.isLoading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
              <Shield className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <DialogTitle className="text-lg font-semibold tracking-tight">
              Gerenciar acessos
            </DialogTitle>
          </div>
          <DialogDescription>
            Defina quem pode visualizar ou registrar compras no cartão{' '}
            <strong className="text-foreground">{card?.name}</strong>.
            Administradores têm acesso global e não aparecem na lista.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-xl border border-border/60 bg-background/40">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          ) : usersQuery.isError || aclsQuery.isError ? (
            <div className="p-6 text-center text-sm text-destructive">
              Falha ao carregar dados.
            </div>
          ) : eligibleUsers.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum membro disponível para conceder acesso.
            </div>
          ) : (
            <ul className="max-h-[420px] divide-y divide-border/40 overflow-y-auto">
              {eligibleUsers.map((u) => {
                const perm = perms.get(u.id) ?? 'none'
                return (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/30"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 ring-1 ring-border/60">
                        <AvatarFallback className="bg-primary/15 text-xs font-medium text-primary">
                          {initials(u.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{u.name}</span>
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      </div>
                    </div>
                    <Select
                      value={perm}
                      onValueChange={(v) => setPerm(u.id, v as Permission)}
                    >
                      <SelectTrigger className="h-9 w-40 border-border/80 bg-background/60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{PERM_LABEL.none}</SelectItem>
                        <SelectItem value="read">{PERM_LABEL.read}</SelectItem>
                        <SelectItem value="write">{PERM_LABEL.write}</SelectItem>
                      </SelectContent>
                    </Select>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {serverError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {serverError}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading}
            className="shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]"
          >
            {saveMutation.isPending ? 'Salvando...' : 'Salvar acessos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)
      ?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
