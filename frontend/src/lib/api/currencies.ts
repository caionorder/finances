import type { CurrencyMeta } from '@/lib/currency'

export type CurrencyOut = CurrencyMeta

export const KNOWN_CURRENCIES: CurrencyOut[] = [
  { code: 'BRL', symbol: 'R$', decimals: 2, name: 'Real', is_crypto: false },
  { code: 'USD', symbol: 'US$', decimals: 2, name: 'Dólar', is_crypto: false },
  { code: 'PYG', symbol: 'Gs.', decimals: 0, name: 'Guarani', is_crypto: false },
  { code: 'BTC', symbol: '₿', decimals: 8, name: 'Bitcoin', is_crypto: true },
  { code: 'USDT', symbol: '$', decimals: 2, name: 'Tether', is_crypto: true },
]

export function findCurrencyMeta(code: string): CurrencyOut | undefined {
  return KNOWN_CURRENCIES.find((c) => c.code === code)
}

export const currenciesApi = {
  list: async (): Promise<CurrencyOut[]> => KNOWN_CURRENCIES,
}
