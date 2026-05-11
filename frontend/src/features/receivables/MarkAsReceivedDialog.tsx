import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Info } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { accountsApi } from '@/lib/api/accounts'
import { receivablesApi, type ReceivableOut } from '@/lib/api/receivables'
import { formatCurrency } from '@/lib/currency'

const NO_ACCOUNT = '__none__'
const LABEL = 'text-xs font-medium uppercase tracking-wider text-muted-foreground'
const INPUT = 'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'

type Props = {
  receivable: ReceivableOut | null
  onClose: () => void
}

export function MarkAsReceivedDialog({ receivable, onClose }: Props) {
  const queryClient = useQueryClient()
  const open = receivable !== null

  const [receivedAt, setReceivedAt] = useState<string>(today())
  const [accountId, setAccountId] = useState<string>(NO_ACCOUNT)
  const [serverError, setServerError] = useState<string | null>(null)

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: false }],
    queryFn: () => accountsApi.list(false),
    enabled: open,
  })

  const accounts = (accountsQuery.data ?? []).filter(
    (a) => !a.is_archived && a.currency_code === receivable?.currency_code
  )

  useEffect(() => {
    if (!open) {
      setServerError(null)
      return
    }
    setReceivedAt(today())
    setAccountId(
      receivable?.account_id ? String(receivable.account_id) : NO_ACCOUNT
    )
  }, [open, receivable])

  const mutation = useMutation({
    mutationFn: (vars: { received_at: string; account_id?: number }) =>
      receivablesApi.markAsReceived(receivable!.id, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Conta marcada como recebida')
      onClose()
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível marcar como recebida.'))
    },
  })

  function handleSubmit() {
    if (!receivable) return
    setServerError(null)
    mutation.mutate({
      received_at: receivedAt,
      account_id: accountId === NO_ACCOUNT ? undefined : Number(accountId),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="border-border/60 bg-card backdrop-blur-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Marcar como recebido
          </DialogTitle>
          <DialogDescription>
            {receivable ? (
              <span className="block truncate">{receivable.description}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {receivable ? (
          <div className="flex items-baseline gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
            <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-success">
              {formatCurrency(receivable.amount, receivable.currency_code)}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {receivable.currency_code}
            </span>
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rec-received-at" className={LABEL}>
              Data do recebimento
            </Label>
            <Input
              id="rec-received-at"
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              className={`${INPUT} font-mono tabular-nums`}
            />
          </div>

          <div className="space-y-2">
            <Label className={LABEL}>Conta de entrada</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className={INPUT}>
                <SelectValue placeholder="Sem conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACCOUNT}>Sem conta</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name} ({a.currency_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.25} aria-hidden="true" />
            <span>
              Se selecionar uma conta, será criada uma transação de receita nela.
              Caso contrário, apenas marca como recebida.
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
            {mutation.isPending ? 'Marcando...' : 'Marcar como recebido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
