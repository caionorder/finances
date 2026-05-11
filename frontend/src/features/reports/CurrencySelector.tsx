import { Globe, Layers } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CRYPTO_CURRENCIES,
  FIAT_CURRENCIES,
  TOTAL_OPTION,
  type CurrencyOrTotal,
  type SupportedCurrency,
} from './shared'

type BaseProps = {
  label?: string
  className?: string
}

type WithoutTotalProps = BaseProps & {
  value: SupportedCurrency
  onChange: (next: SupportedCurrency) => void
  includeTotal?: false
}

type WithTotalProps = BaseProps & {
  value: CurrencyOrTotal
  onChange: (next: CurrencyOrTotal) => void
  includeTotal: true
}

type Props = WithoutTotalProps | WithTotalProps

const CURRENCY_LABEL: Record<string, string> = {
  BRL: 'Real',
  USD: 'Dólar',
  PYG: 'Guarani',
  BTC: 'Bitcoin',
  USDT: 'Tether',
}

export function CurrencySelector(props: Props) {
  const { label = 'Moeda', className, value, onChange, includeTotal } = props as Props & {
    value: string
    onChange: (next: string) => void
  }

  const isTotal = value === TOTAL_OPTION

  return (
    <div className={className ?? 'space-y-1'}>
      <span className="block font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={(v) => onChange(v)}>
        <SelectTrigger className="h-9 w-[160px] gap-2 border-border/60 bg-card shadow-soft transition-colors focus:border-primary">
          {isTotal ? (
            <Layers className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
          ) : (
            <Globe className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.25} />
          )}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {includeTotal && (
            <SelectGroup>
              <SelectLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Consolidado
              </SelectLabel>
              <SelectItem value={TOTAL_OPTION} className="font-mono">
                <span className="font-semibold text-primary">TOTAL</span>{' '}
                <span className="ml-1 text-muted-foreground text-[11px]">≈ USD</span>
              </SelectItem>
            </SelectGroup>
          )}
          <SelectGroup>
            <SelectLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Fiat
            </SelectLabel>
            {FIAT_CURRENCIES.map((c) => (
              <SelectItem key={c} value={c} className="font-mono">
                <span className="font-semibold">{c}</span>
                <span className="ml-1 text-muted-foreground text-[11px]">
                  {CURRENCY_LABEL[c]}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Crypto
            </SelectLabel>
            {CRYPTO_CURRENCIES.map((c) => (
              <SelectItem key={c} value={c} className="font-mono">
                <span className="font-semibold">{c}</span>
                <span className="ml-1 text-muted-foreground text-[11px]">
                  {CURRENCY_LABEL[c]}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
