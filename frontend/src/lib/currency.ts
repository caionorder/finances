export type CurrencyMeta = {
  code: string
  symbol: string
  decimals: number
  name: string
  is_crypto: boolean
}

const FIAT_FORMATTERS: Record<string, Intl.NumberFormat> = {
  BRL: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
  USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
  PYG: new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }),
}

const CRYPTO_SYMBOLS: Record<string, string> = {
  BTC: '₿',
  ETH: 'Ξ',
  USDT: '$',
  USDC: '$',
}

export function formatCurrency(
  amount: string | number,
  code: string,
  meta?: CurrencyMeta
): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount
  if (Number.isNaN(value)) return '—'

  const fiatFmt = FIAT_FORMATTERS[code]
  if (fiatFmt && !meta?.is_crypto) return fiatFmt.format(value)

  const decimals = meta?.decimals ?? currencyDecimals(code)
  const clampedDecimals = Math.min(Math.max(decimals, 0), 8)
  const symbol = CRYPTO_SYMBOLS[code] ?? meta?.symbol ?? code
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: clampedDecimals,
    maximumFractionDigits: clampedDecimals,
  }).format(value)
  return `${symbol} ${formatted}`
}

export function currencyDecimals(code: string, meta?: CurrencyMeta): number {
  if (meta) return meta.decimals
  if (code === 'PYG') return 0
  if (code === 'BTC' || code === 'ETH') return 8
  // USDT/USDC: stablecoins exibidas com 2 decimais como fiat (mesmo que blockchain use 6)
  return 2
}

export function currencySymbol(code: string, meta?: CurrencyMeta): string {
  if (meta?.symbol) return meta.symbol
  if (CRYPTO_SYMBOLS[code]) return CRYPTO_SYMBOLS[code]
  switch (code) {
    case 'BRL':
      return 'R$'
    case 'USD':
      return 'US$'
    case 'PYG':
      return '₲'
    default:
      return code
  }
}
