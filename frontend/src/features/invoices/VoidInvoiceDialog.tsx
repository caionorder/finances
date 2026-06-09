import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { invoicesApi, type InvoiceOut } from '@/lib/api/invoices'
import { extractError } from './utils'

const LABEL = 'text-xs font-medium uppercase tracking-wider text-muted-foreground'

type Props = {
  invoice: InvoiceOut | null
  onClose: () => void
}

export function VoidInvoiceDialog({ invoice, onClose }: Props) {
  const queryClient = useQueryClient()
  const open = invoice !== null
  const [reason, setReason] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)

  function close() {
    setReason('')
    setServerError(null)
    onClose()
  }

  const mutation = useMutation({
    mutationFn: (vars: { reason: string }) =>
      invoicesApi.void(invoice!.id, vars.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['receivables'] })
      toast.success('Invoice anulada')
      close()
    },
    onError: (err) =>
      setServerError(extractError(err, 'Não foi possível anular.')),
  })

  function handleSubmit() {
    const trimmed = reason.trim()
    if (!trimmed) {
      setServerError('Informe o motivo da anulação.')
      return
    }
    setServerError(null)
    mutation.mutate({ reason: trimmed })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="border-border/60 bg-card backdrop-blur-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Anular invoice
          </DialogTitle>
          <DialogDescription>
            {invoice ? (
              <span className="block truncate font-mono text-xs">
                {invoice.number ?? `Invoice #${invoice.id}`}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <span>
            O número é retido, mas a invoice deixa de ser válida. O recebível
            vinculado (se ainda não recebido) será cancelado. Esta ação não pode
            ser desfeita.
          </span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="void-reason" className={LABEL}>
            Motivo (obrigatório)
          </Label>
          <Textarea
            id="void-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: emitida em duplicidade, valor incorreto..."
            className="border-border/80 bg-background/50 transition-colors focus:border-primary"
          />
        </div>

        {serverError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {serverError}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Anulando...' : 'Anular invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
