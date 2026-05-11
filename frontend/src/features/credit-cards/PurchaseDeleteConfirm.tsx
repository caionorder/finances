import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { AlertTriangle, Info } from 'lucide-react'
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
import { purchasesApi, type PurchaseOut } from '@/lib/api/purchases'

type Props = {
  purchase: PurchaseOut | null
  cardId: number
  onClose: () => void
}

export function PurchaseDeleteConfirm({ purchase, cardId, onClose }: Props) {
  const open = purchase !== null
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)

  const removeMutation = useMutation({
    mutationFn: () => purchasesApi.remove(purchase!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycles', cardId] })
      queryClient.invalidateQueries({ queryKey: ['purchases', cardId] })
      queryClient.invalidateQueries({ queryKey: ['credit-cards'] })
      toast.success('Compra excluída')
      onClose()
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível excluir a compra.'))
    },
  })

  if (!purchase) {
    return null
  }

  const isSeries = purchase.installment_of > 1
  const isFirstOfSeries = isSeries && purchase.parent_purchase_id === null
  const isMidSeries = isSeries && purchase.parent_purchase_id !== null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setServerError(null)
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Excluir compra
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">
              {purchase.description || 'Compra sem descrição'}
            </span>
            {' — '}
            <span className="font-mono tabular-nums">{formatDateBR(purchase.purchase_date)}</span>
          </DialogDescription>
        </DialogHeader>

        {isFirstOfSeries ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Atenção: série de parcelas</p>
              <p className="mt-1">
                Esta é a <strong>primeira parcela</strong> de uma série de{' '}
                <strong className="font-mono tabular-nums">{purchase.installment_of} parcelas</strong>. Excluir esta
                vai <strong>REMOVER TODAS as {purchase.installment_of} parcelas</strong>{' '}
                da série.
              </p>
            </div>
          </div>
        ) : null}

        {isMidSeries ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-3 text-sm text-warning">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Parcela individual</p>
              <p className="mt-1">
                Esta é a parcela{' '}
                <strong className="font-mono tabular-nums">
                  {purchase.installment_n}/{purchase.installment_of}
                </strong>{' '}
                da série. Excluir esta <strong>NÃO afeta</strong> as outras
                parcelas.
              </p>
            </div>
          </div>
        ) : null}

        {!isSeries ? (
          <p className="text-sm text-muted-foreground">
            Confirma excluir esta compra?
          </p>
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
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
          >
            {removeMutation.isPending
              ? 'Excluindo...'
              : isFirstOfSeries
                ? `Excluir série (${purchase.installment_of}x)`
                : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatDateBR(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)
      ?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
