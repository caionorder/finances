import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { History, Info } from 'lucide-react'
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
import { payablesApi, type PayableOut } from '@/lib/api/payables'
import { formatCurrency } from '@/lib/currency'

const NO_ACCOUNT = '__none__'
const LABEL = 'text-xs font-medium uppercase tracking-wider text-muted-foreground'
const INPUT = 'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'

type Props = {
  payable: PayableOut | null
  onClose: () => void
}

/**
 * Outer wrapper. Mounts a fresh `<MarkAsPaidDialogInner>` per payable via `key`,
 * so all internal form state (amount, paid_at, account, server error) resets
 * cleanly when the user opens a different payable. This avoids the
 * `setState`-inside-`useEffect` antipattern.
 */
export function MarkAsPaidDialog({ payable, onClose }: Props) {
  const open = payable !== null
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      {payable ? (
        <MarkAsPaidDialogInner key={payable.id} payable={payable} onClose={onClose} />
      ) : null}
    </Dialog>
  )
}

type InnerProps = {
  payable: PayableOut
  onClose: () => void
}

function MarkAsPaidDialogInner({ payable, onClose }: InnerProps) {
  const queryClient = useQueryClient()

  const remainingAmount = useMemo(() => {
    const v = parseFloat(payable.remaining_amount)
    return Number.isNaN(v) ? 0 : v
  }, [payable.remaining_amount])

  const totalAmount = useMemo(() => {
    const v = parseFloat(payable.amount)
    return Number.isNaN(v) ? 0 : v
  }, [payable.amount])

  const paidSoFar = useMemo(() => {
    const v = parseFloat(payable.paid_amount)
    return Number.isNaN(v) ? 0 : v
  }, [payable.paid_amount])

  // Lazy initializers — run once on mount (which is per-payable thanks to key prop above).
  const [paidAt, setPaidAt] = useState<string>(() => today())
  const [accountId, setAccountId] = useState<string>(() =>
    payable.account_id ? String(payable.account_id) : NO_ACCOUNT
  )
  const [amountInput, setAmountInput] = useState<string>(() =>
    formatNumberInput(remainingAmount, payable.currency_code)
  )
  const [serverError, setServerError] = useState<string | null>(null)

  const accountsQuery = useQuery({
    queryKey: ['accounts', { includeArchived: false }],
    queryFn: () => accountsApi.list(false),
  })

  const accounts = (accountsQuery.data ?? []).filter(
    (a) => !a.is_archived && a.currency_code === payable.currency_code
  )

  const parsedAmount = useMemo(() => parseAmountInput(amountInput), [amountInput])

  const validationError = useMemo(() => {
    if (amountInput.trim() === '') return 'Informe um valor.'
    if (parsedAmount === null) return 'Valor inválido.'
    if (parsedAmount <= 0) return 'O valor deve ser maior que zero.'
    // Tolerância de 0.001 para arredondamentos de Decimal
    if (parsedAmount > remainingAmount + 0.001) {
      return 'O valor não pode ser maior que o restante a pagar.'
    }
    return null
  }, [amountInput, parsedAmount, remainingAmount])

  const isFullPayment = useMemo(() => {
    if (parsedAmount === null) return false
    return Math.abs(parsedAmount - remainingAmount) < 0.001
  }, [parsedAmount, remainingAmount])

  const mutation = useMutation({
    mutationFn: (vars: { paid_at: string; account_id?: number; amount?: number }) =>
      payablesApi.markAsPaid(payable.id, vars),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payables'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      const fullyPaid = data.status === 'paid'
      toast.success(fullyPaid ? 'Conta marcada como paga' : 'Pagamento parcial registrado')
      onClose()
    },
    onError: (err) => {
      setServerError(extractError(err, 'Não foi possível marcar como paga.'))
    },
  })

  function handleSubmit() {
    if (validationError || parsedAmount === null) return
    setServerError(null)
    mutation.mutate({
      paid_at: paidAt,
      account_id: accountId === NO_ACCOUNT ? undefined : Number(accountId),
      amount: parsedAmount,
    })
  }

  function handlePayAll() {
    setAmountInput(formatNumberInput(remainingAmount, payable.currency_code))
  }

  // Filter out only the payments that already exist (partial payments history)
  const previousPayments = payable.payments ?? []
  const hasPreviousPayments = previousPayments.length > 0

  return (
    <DialogContent className="border-border/60 bg-card backdrop-blur-xl sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="text-lg font-semibold tracking-tight">
          Marcar como pago
        </DialogTitle>
        <DialogDescription>
          <span className="block truncate">{payable.description}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
            {formatCurrency(payable.amount, payable.currency_code)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {payable.currency_code}
          </span>
        </div>
        {hasPreviousPayments ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            <span>
              Pago{' '}
              <span className="text-foreground">
                {formatCurrency(payable.paid_amount, payable.currency_code)}
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Falta{' '}
              <span className="text-warning">
                {formatCurrency(payable.remaining_amount, payable.currency_code)}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      {hasPreviousPayments ? (
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />
            <span className={LABEL}>Pagamentos anteriores</span>
          </div>
          <ul className="space-y-1">
            {previousPayments.map((pmt) => (
              <li
                key={pmt.id}
                className="flex items-center justify-between font-mono text-xs tabular-nums"
              >
                <span className="text-foreground">
                  {formatCurrency(pmt.amount, payable.currency_code)}
                </span>
                <span className="text-muted-foreground">
                  em {formatDateBR(pmt.paid_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="pay-amount" className={LABEL}>
              Valor a pagar
            </Label>
            {remainingAmount > 0 ? (
              <button
                type="button"
                onClick={handlePayAll}
                className="font-mono text-[10px] uppercase tracking-widest text-primary transition-colors hover:text-primary/80"
              >
                Pagar tudo
              </button>
            ) : null}
          </div>
          <Input
            id="pay-amount"
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0,00"
            className={`${INPUT} font-mono tabular-nums`}
            aria-invalid={validationError !== null}
            aria-describedby="pay-amount-help"
          />
          <p
            id="pay-amount-help"
            className="font-mono text-[11px] tabular-nums text-muted-foreground"
          >
            Restante a pagar:{' '}
            <span className={remainingAmount > 0 ? 'text-foreground' : 'text-muted-foreground'}>
              {formatCurrency(remainingAmount, payable.currency_code)}
            </span>
            {!isFullPayment && parsedAmount !== null && parsedAmount > 0 && validationError === null ? (
              <>
                {' '}
                <span aria-hidden="true">·</span>{' '}
                <span>
                  Após:{' '}
                  <span className="text-warning">
                    {formatCurrency(
                      Math.max(0, totalAmount - paidSoFar - parsedAmount),
                      payable.currency_code
                    )}
                  </span>
                </span>
              </>
            ) : null}
          </p>
          {validationError ? (
            <p className="text-xs text-destructive">{validationError}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pay-paid-at" className={LABEL}>
            Data do pagamento
          </Label>
          <Input
            id="pay-paid-at"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className={`${INPUT} font-mono tabular-nums`}
          />
        </div>

        <div className="space-y-2">
          <Label className={LABEL}>Conta de saída</Label>
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

        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.25} aria-hidden="true" />
          <span>
            Se selecionar uma conta, será criada uma transação de despesa nela.
            Caso contrário, apenas registra o pagamento.
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
          disabled={mutation.isPending || validationError !== null}
          className="shadow-[0_0_24px_-8px_var(--color-primary)]"
        >
          {mutation.isPending
            ? 'Marcando...'
            : isFullPayment
              ? 'Marcar como pago'
              : 'Registrar pagamento parcial'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDateBR(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

/**
 * Format a number for display in the payment amount input.
 * pt-BR locale uses comma as decimal separator (BRL/PYG); USD uses dot.
 */
function formatNumberInput(value: number, currencyCode: string): string {
  if (!Number.isFinite(value)) return ''
  const decimals = currencyCode === 'PYG' ? 0 : 2
  if (currencyCode === 'USD') {
    return value.toFixed(decimals)
  }
  return value.toFixed(decimals).replace('.', ',')
}

/**
 * Parse the payment amount input back to a number, accepting both pt-BR
 * ("1.234,56") and en-US ("1,234.56" or "1234.56") formats. Returns null
 * if the value can't be parsed.
 */
function parseAmountInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const lastComma = trimmed.lastIndexOf(',')
  const lastDot = trimmed.lastIndexOf('.')
  let normalized: string
  if (lastComma > lastDot) {
    // pt-BR: "1.234,56" → "1234.56"
    normalized = trimmed.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    // en-US "1,234.56" or plain "1234.56"
    normalized = trimmed.replace(/,/g, '')
  } else {
    normalized = trimmed
  }
  const v = parseFloat(normalized)
  return Number.isFinite(v) ? v : null
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
