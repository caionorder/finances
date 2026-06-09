import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Lock } from 'lucide-react'
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
import { invoicesApi, type InvoiceOut } from '@/lib/api/invoices'
import { issuerApi } from '@/lib/api/issuer'
import { accountsApi } from '@/lib/api/accounts'
import { formatCurrency } from '@/lib/currency'
import { extractError, today } from './utils'

const LABEL = 'text-xs font-medium uppercase tracking-wider text-muted-foreground'
const INPUT =
  'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'

type Props = {
  invoice: InvoiceOut | null
  onClose: () => void
}

export function MarkReceivedDialog({ invoice, onClose }: Props) {
  return (
    <Dialog
      open={invoice !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="border-border/60 bg-card backdrop-blur-xl sm:max-w-lg">
        {invoice ? <Body invoice={invoice} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function Body({
  invoice,
  onClose,
}: {
  invoice: InvoiceOut
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [receivedAt, setReceivedAt] = useState<string>(today())
  const [serverError, setServerError] = useState<string | null>(null)

  const issuerQuery = useQuery({
    queryKey: ['settings', 'issuer'],
    queryFn: () => issuerApi.get(),
  })

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: false }],
    queryFn: () => accountsApi.list(false),
  })

  const receivingAccount = (accountsQuery.data ?? []).find(
    (a) => a.id === issuerQuery.data?.receiving_account_id
  )

  const mutation = useMutation({
    mutationFn: (vars: { received_at: string }) =>
      invoicesApi.markReceived(invoice.id, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['receivables'] })
      toast.success('Recebimento registrado')
      onClose()
    },
    onError: (err) =>
      setServerError(extractError(err, 'Não foi possível registrar.')),
  })

  function handleSubmit() {
    setServerError(null)
    mutation.mutate({ received_at: receivedAt })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg font-semibold tracking-tight">
          Registrar recebimento
        </DialogTitle>
        <DialogDescription>
          <span className="block truncate font-mono text-xs">
            {invoice.number ?? `Invoice #${invoice.id}`}
          </span>
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-baseline justify-between gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Crédito líquido na Continental
          </span>
          <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-success">
            {formatCurrency(invoice.net_amount, invoice.currency_code)}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {invoice.currency_code}
        </span>
      </div>

      <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inv-received-at" className={LABEL}>
              Data do recebimento (wire)
            </Label>
            <Input
              id="inv-received-at"
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              className={`${INPUT} font-mono tabular-nums`}
            />
          </div>

          <div className="space-y-2">
            <Label className={LABEL}>Conta de entrada</Label>
            <div className="flex items-center gap-2 rounded-md border border-border/80 bg-muted/30 px-3 py-2.5 text-sm">
              <Lock
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="truncate">
                {receivingAccount
                  ? `${receivingAccount.name} (${receivingAccount.currency_code})`
                  : 'Conta Continental (configurada no Emissor)'}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-muted-foreground">
            <Info
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
              strokeWidth={2.25}
              aria-hidden="true"
            />
            <span>
              Registra uma transação de receita pelo valor líquido (total − taxa
              de US$ {invoice.bank_fee_amount}) na conta Continental. A invoice
              passa a <strong>Paga</strong>.
            </span>
          </div>

          {serverError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {serverError}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="bg-success text-success-foreground hover:bg-success/90 shadow-[0_0_24px_-8px_var(--color-success)]"
          >
            {mutation.isPending ? 'Registrando...' : 'Registrar recebimento'}
          </Button>
        </DialogFooter>
    </>
  )
}
