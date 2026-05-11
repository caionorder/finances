import { api } from './client'

export type CashflowGroupBy = 'month' | 'week' | 'day'

export type CashflowBucket = {
  period: string
  income: string
  expense: string
  net: string
}

export type CashflowReport = {
  currency: string
  from_date: string
  to_date: string
  group_by: CashflowGroupBy
  buckets: CashflowBucket[]
  totals: CashflowBucket
}

export type CategoryNode = {
  category_id: number | null
  name: string
  color: string | null
  icon: string | null
  own_total: string
  subtree_total: string
  children: CategoryNode[]
}

export type ByCategoryReport = {
  currency: string
  from_date: string
  to_date: string
  kind: 'income' | 'expense'
  total: string
  nodes: CategoryNode[]
}

export type ForecastActualItem = {
  period: string
  forecast_in: string
  actual_in: string
  forecast_out: string
  actual_out: string
}

export type ForecastVsActualReport = {
  currency: string
  from_date: string
  to_date: string
  items: ForecastActualItem[]
}

export type AccountBalance = {
  account_id: number
  name: string
  type: string
  balance: string
}

export type CreditCardBalance = {
  credit_card_id: number
  name: string
  cycle_total: string
  available_credit: string | null
}

export type NetWorthByCurrency = {
  currency: string
  accounts_total: string
  credit_cards_total: string
  net: string
  accounts: AccountBalance[]
  credit_cards: CreditCardBalance[]
}

export type NetWorthReport = {
  as_of: string
  by_currency: NetWorthByCurrency[]
}

// ---- Outstanding (mirrored from payables/receivables APIs for convenience) ---

// ---- Aging --------------------------------------------------------------

export type AgingBucketKey =
  | 'overdue'
  | 'due_today'
  | '1_7'
  | '8_14'
  | '15_30'
  | '30_plus'

export type AgingBucket = {
  count: number
  total_remaining: string
}

export type AgingReport = {
  currency_code: string
  as_of: string
  buckets: Record<AgingBucketKey, AgingBucket>
  grand_total_remaining: string
  grand_count: number
}

// ---- Burn rate ----------------------------------------------------------

export type MonthExpense = {
  period: string
  expense: string
}

export type BurnRateReport = {
  currency_code: string
  as_of: string
  burn_3m: string
  burn_6m: string
  burn_12m: string
  by_month: MonthExpense[]
}

// ---- Savings rate -------------------------------------------------------

export type SavingsItem = {
  period: string
  income: string
  expense: string
  savings_rate: string | null
}

export type SavingsRateReport = {
  currency_code: string
  from_date: string
  to_date: string
  items: SavingsItem[]
  avg_3m: string | null
  avg_12m: string | null
}

// ---- Runway -------------------------------------------------------------

export type RunwayStatus = 'critical' | 'warning' | 'healthy' | 'unknown'

export type RunwayReport = {
  currency_code: string
  as_of: string
  net_worth: string
  burn_3m: string
  burn_6m: string
  burn_12m: string
  runway_months_3m: string | null
  runway_months_6m: string | null
  runway_months_12m: string | null
  target_months: number
  status: RunwayStatus
}

// ---- Currency exposure --------------------------------------------------

export type CurrencyExposureItem = {
  currency: string
  net: string
  converted: string | null
  pct: string | null
}

export type CurrencyExposureReport = {
  as_of: string
  convert_to: string
  total_converted: string
  items: CurrencyExposureItem[]
}

// ---- Top categories MoM -------------------------------------------------

export type TopCategoryItem = {
  category_id: number | null
  name: string
  current: string
  previous: string
  delta_pct: string | null
  delta_abs: string
  is_new: boolean
}

export type TopCategoriesReport = {
  currency_code: string
  month: string
  prev_month: string
  items: TopCategoryItem[]
}

// ---- Net worth trend ----------------------------------------------------

export type NetWorthTrendCurrency = {
  currency: string
  net: string
  converted: string | null
}

export type NetWorthTrendItem = {
  period: string
  by_currency: NetWorthTrendCurrency[]
  total_converted: string | null
}

export type NetWorthTrendReport = {
  convert_to: string
  from_date: string
  to_date: string
  items: NetWorthTrendItem[]
}

export const reportsApi = {
  cashflow: async (params: {
    currency: string
    from: string
    to: string
    group_by: CashflowGroupBy
  }): Promise<CashflowReport> => {
    const { data } = await api.get<CashflowReport>('/reports/cashflow', {
      params,
    })
    return data
  },
  byCategory: async (params: {
    currency: string
    from: string
    to: string
    kind: 'income' | 'expense'
  }): Promise<ByCategoryReport> => {
    const { data } = await api.get<ByCategoryReport>('/reports/by-category', {
      params,
    })
    return data
  },
  forecastVsActual: async (params: {
    currency: string
    from: string
    to: string
  }): Promise<ForecastVsActualReport> => {
    const { data } = await api.get<ForecastVsActualReport>(
      '/reports/forecast-vs-actual',
      { params }
    )
    return data
  },
  netWorth: async (params?: {
    as_of?: string
    include_archived?: boolean
  }): Promise<NetWorthReport> => {
    const { data } = await api.get<NetWorthReport>('/reports/net-worth', {
      params,
    })
    return data
  },
  payablesAging: async (params: {
    currency_code: string
    as_of?: string
  }): Promise<AgingReport> => {
    const { data } = await api.get<AgingReport>('/reports/payables-aging', {
      params,
    })
    return data
  },
  receivablesAging: async (params: {
    currency_code: string
    as_of?: string
  }): Promise<AgingReport> => {
    const { data } = await api.get<AgingReport>('/reports/receivables-aging', {
      params,
    })
    return data
  },
  burnRate: async (params: {
    currency_code: string
    as_of?: string
  }): Promise<BurnRateReport> => {
    const { data } = await api.get<BurnRateReport>('/reports/burn-rate', {
      params,
    })
    return data
  },
  savingsRate: async (params: {
    currency_code: string
    from: string
    to: string
  }): Promise<SavingsRateReport> => {
    const { data } = await api.get<SavingsRateReport>('/reports/savings-rate', {
      params,
    })
    return data
  },
  runway: async (params: {
    currency_code: string
    target_months?: number
    as_of?: string
  }): Promise<RunwayReport> => {
    const { data } = await api.get<RunwayReport>('/reports/runway', {
      params,
    })
    return data
  },
  currencyExposure: async (params: {
    convert_to: string
    as_of?: string
  }): Promise<CurrencyExposureReport> => {
    const { data } = await api.get<CurrencyExposureReport>(
      '/reports/currency-exposure',
      { params }
    )
    return data
  },
  topCategories: async (params: {
    currency_code: string
    month?: string
    top_n?: number
  }): Promise<TopCategoriesReport> => {
    const { data } = await api.get<TopCategoriesReport>('/reports/top-categories', {
      params,
    })
    return data
  },
  netWorthTrend: async (params: {
    from: string
    to: string
    convert_to: string
  }): Promise<NetWorthTrendReport> => {
    const { data } = await api.get<NetWorthTrendReport>('/reports/net-worth-trend', {
      params,
    })
    return data
  },
}
