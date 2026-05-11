import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  usersApi,
  type CreateUserPayload,
  type UpdateUserPayload,
} from '@/lib/api/users'
import type { UserPublic, UserRole } from '@/lib/api/auth'

const ROLES: UserRole[] = ['admin', 'member', 'viewer']
const roleLabel: Record<UserRole, string> = {
  admin: 'Administrador',
  member: 'Membro',
  viewer: 'Visualizador',
}

const createSchema = z.object({
  email: z.string().min(1, 'Informe o email').email('Email inválido'),
  name: z.string().min(1, 'Informe o nome'),
  role: z.enum(['admin', 'member', 'viewer'] as const),
})

const editSchema = z.object({
  name: z.string().min(1, 'Informe o nome'),
  role: z.enum(['admin', 'member', 'viewer'] as const),
  is_active: z.boolean(),
})

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: UserPublic | null
  onCreated?: (temporaryPassword: string) => void
}

const inputClass =
  'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'
const labelClass =
  'text-xs font-medium uppercase tracking-wider text-muted-foreground'

export function UserFormDialog({ open, onOpenChange, user, onCreated }: Props) {
  const isEdit = Boolean(user)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: '', name: '', role: 'member' },
  })

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: user?.name ?? '',
      role: (user?.role ?? 'member') as UserRole,
      is_active: user?.is_active ?? true,
    },
  })

  useEffect(() => {
    if (!open) {
      setServerError(null)
      return
    }
    if (isEdit && user) {
      editForm.reset({
        name: user.name,
        role: user.role,
        is_active: user.is_active,
      })
    } else {
      createForm.reset({ email: '', name: '', role: 'member' })
    }
  }, [open, isEdit, user, createForm, editForm])

  const createMutation = useMutation({
    mutationFn: (payload: CreateUserPayload) => usersApi.create(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Usuário criado')
      onCreated?.(data.temporary_password)
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível criar o usuário.'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateUserPayload) => usersApi.update(user!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Usuário atualizado')
      onOpenChange(false)
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível atualizar o usuário.'))
    },
  })

  function handleCreate(values: CreateValues) {
    setServerError(null)
    createMutation.mutate(values)
  }

  function handleEdit(values: EditValues) {
    setServerError(null)
    updateMutation.mutate(values)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            {isEdit ? 'Editar usuário' : 'Novo usuário'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize os dados do usuário. Para trocar a senha use Resetar senha.'
              : 'O sistema gerará uma senha provisória que aparecerá apenas uma vez.'}
          </DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="edit-name" className={labelClass}>
                Nome
              </Label>
              <Input id="edit-name" className={inputClass} {...editForm.register('name')} />
              {editForm.formState.errors.name ? (
                <p className="text-xs text-destructive">
                  {editForm.formState.errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className={labelClass}>Role</Label>
              <Controller
                control={editForm.control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {roleLabel[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
              <div className="flex flex-col">
                <Label htmlFor="edit-active" className="cursor-pointer text-sm font-medium">
                  Usuário ativo
                </Label>
                <span className="text-xs text-muted-foreground">
                  Inativos não conseguem autenticar.
                </span>
              </div>
              <Controller
                control={editForm.control}
                name="is_active"
                render={({ field }) => (
                  <input
                    id="edit-active"
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-primary"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                )}
              />
            </div>

            {serverError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="transition-shadow hover:shadow-[0_0_24px_-6px_var(--color-primary)]"
              >
                {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="create-email" className={labelClass}>
                Email
              </Label>
              <Input
                id="create-email"
                type="email"
                autoComplete="off"
                className={inputClass}
                {...createForm.register('email')}
              />
              {createForm.formState.errors.email ? (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-name" className={labelClass}>
                Nome
              </Label>
              <Input
                id="create-name"
                className={inputClass}
                {...createForm.register('name')}
              />
              {createForm.formState.errors.name ? (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className={labelClass}>Role</Label>
              <Controller
                control={createForm.control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className={inputClass}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {roleLabel[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {serverError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="transition-shadow hover:shadow-[0_0_24px_-6px_var(--color-primary)]"
              >
                {createMutation.isPending ? 'Criando...' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
    if (err.response?.status === 409) return 'Já existe um usuário com este email.'
  }
  return fallback
}
