import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { AlertTriangle } from 'lucide-react'
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
import {
  transactionsApi,
  type TransactionOut,
} from '@/lib/api/transactions'

type Props = {
  transaction: TransactionOut | null
  onClose: () => void
}

export function DeleteTransactionDialog({ transaction, onClose }: Props) {
  const queryClient = useQueryClient()
  const isTransfer = transaction?.kind === 'transfer'

  const mutation = useMutation({
    mutationFn: (id: number) => transactionsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(isTransfer ? 'Transferência excluída' : 'Transação excluída')
      onClose()
    },
    onError: (err) => {
      toast.error(extractError(err, 'Falha ao excluir.'))
    },
  })

  return (
    <Dialog
      open={transaction !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {isTransfer ? 'Excluir transferência' : 'Excluir transação'}
          </DialogTitle>
          <DialogDescription>
            {isTransfer
              ? 'Esta operação é permanente.'
              : 'Esta operação é permanente. O saldo da conta será atualizado.'}
          </DialogDescription>
        </DialogHeader>

        {isTransfer ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Esta operação vai excluir <strong>as duas transações</strong> da
              transferência (origem e destino) e ajustar os saldos das duas contas.
            </span>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (transaction) mutation.mutate(transaction.id)
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
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
