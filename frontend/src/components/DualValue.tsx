import { useQuery } from '@tanstack/react-query'
import { fxApi } from '@/lib/api/fx'
import { findCurrencyMeta } from '@/lib/api/currencies'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'

type Props = {
  amount: string | number
  code: string
  convertTo?: string
  className?: string
}

export function DualValue({
  amount,
  code,
  convertTo = 'BRL',
  className,
}: Props) {
  const meta = findCurrencyMeta(code)
  const showConversion =
    code !== convertTo && (meta?.is_crypto || code !== 'BRL')

  const { data: rates } = useQuery({
    queryKey: ['fx-rates'],
    queryFn: () => fxApi.list(),
    staleTime: 5 * 60_000,
    enabled: showConversion,
  })

  const primary = formatCurrency(amount, code, meta)

  let converted: string | null = null
  if (showConversion && rates) {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount
    if (!Number.isNaN(value)) {
      const rate = rates.find(
        (r) => r.base_code === code && r.quote_code === convertTo
      )
      if (rate) {
        const rateNum = parseFloat(rate.rate)
        if (!Number.isNaN(rateNum)) {
          const targetMeta = findCurrencyMeta(convertTo)
          converted = formatCurrency(value * rateNum, convertTo, targetMeta)
        }
      }
    }
  }

  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <span className="font-mono tabular-nums">{primary}</span>
      {converted && (
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          ≈ {converted}
        </span>
      )}
    </span>
  )
}
