import { useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { investmentsApi, type MovementOut } from '@/lib/api/investments'
import { formatCurrency } from '@/lib/currency'
import { formatDateBR, MOVEMENT_LABEL } from './shared'

type Props = {
  investmentId: number
  movement: MovementOut | null
  currencyCode: string
  onClose: () => void
}

export function DeleteMovementDialog({
  investmentId,
  movement,
  currencyCode,
  onClose,
}: Props) {
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (mvId: number) =>
      investmentsApi.removeMovement(investmentId, mvId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['investment-movements', investmentId],
      })
      queryClient.invalidateQueries({
        queryKey: ['investment-position', investmentId],
      })
      queryClient.invalidateQueries({ queryKey: ['investments'] })
      toast.success('Movimento excluído')
      onClose()
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível excluir o movimento.'))
    },
  })

  return (
    <Dialog
      open={movement !== null}
      onOpenChange={(next) => {
        if (!next) {
          setServerError(null)
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Excluir movimento
          </DialogTitle>
          <DialogDescription>
            A exclusão é irreversível. Confira os dados antes de prosseguir.
          </DialogDescription>
        </DialogHeader>

        {movement ? (
          <div className="space-y-1 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
            <p>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Tipo
              </span>{' '}
              <span className="ml-1 font-medium">
                {MOVEMENT_LABEL[movement.type]}
              </span>
            </p>
            <p>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Data
              </span>{' '}
              <span className="ml-1 font-mono tabular-nums">
                {formatDateBR(movement.date)}
              </span>
            </p>
            <p>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Valor
              </span>{' '}
              <span className="ml-1 font-mono font-semibold tabular-nums">
                {formatCurrency(movement.amount, currencyCode)}
              </span>
            </p>
          </div>
        ) : null}

        {serverError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {serverError}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (movement) mutation.mutate(movement.id)
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)
      ?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
