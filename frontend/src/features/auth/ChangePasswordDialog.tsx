import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
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
import { authApi } from '@/lib/api/auth'

const schema = z
  .object({
    current_password: z.string().min(1, 'Informe a senha atual'),
    new_password: z.string().min(8, 'A nova senha deve ter ao menos 8 caracteres'),
    confirm_password: z.string().min(1, 'Confirme a nova senha'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'As senhas não coincidem',
    path: ['confirm_password'],
  })

type FormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })

  useEffect(() => {
    if (!open) {
      reset()
      setServerError(null)
    }
  }, [open, reset])

  async function onSubmit(values: FormValues) {
    setServerError(null)
    try {
      await authApi.changePassword(values.current_password, values.new_password)
      toast.success('Senha alterada com sucesso')
      onOpenChange(false)
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 400) {
        const detail = (err.response.data as { detail?: unknown })?.detail
        setServerError(typeof detail === 'string' ? detail : 'Senha atual incorreta.')
      } else if (isAxiosError(err) && err.response?.status === 401) {
        setServerError('Senha atual incorreta.')
      } else {
        setServerError('Não foi possível alterar a senha.')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trocar senha</DialogTitle>
          <DialogDescription>
            Use uma senha forte com pelo menos 8 caracteres.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="current_password">Senha atual</Label>
            <Input
              id="current_password"
              type="password"
              autoComplete="current-password"
              {...register('current_password')}
            />
            {errors.current_password ? (
              <p className="text-sm text-destructive">{errors.current_password.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="new_password">Nova senha</Label>
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              {...register('new_password')}
            />
            {errors.new_password ? (
              <p className="text-sm text-destructive">{errors.new_password.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirmar nova senha</Label>
            <Input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              {...register('confirm_password')}
            />
            {errors.confirm_password ? (
              <p className="text-sm text-destructive">{errors.confirm_password.message}</p>
            ) : null}
          </div>

          {serverError ? (
            <div
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {serverError}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
