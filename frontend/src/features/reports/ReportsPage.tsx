import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BarChart3, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgingReport } from './AgingReport'
import { BurnRateReport } from './BurnRateReport'
import { ByCategoryReport } from './ByCategoryReport'
import { CashflowReport } from './CashflowReport'
import { CurrencyExposureReport } from './CurrencyExposureReport'
import { CurrencySelector } from './CurrencySelector'
import { ForecastVsActualReport } from './ForecastVsActualReport'
import { NetWorthReport } from './NetWorthReport'
import { NetWorthTrendReport } from './NetWorthTrendReport'
import { RunwayReport } from './RunwayReport'
import { SavingsRateReport } from './SavingsRateReport'
import { TopCategoriesReport } from './TopCategoriesReport'
import { type SupportedCurrency } from './shared'

export function ReportsPage() {
  const [currency, setCurrency] = useState<SupportedCurrency>('BRL')
  const queryClient = useQueryClient()

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['reports'] })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <BarChart3 className="h-3 w-3 text-primary" strokeWidth={2.25} />
            <span>Relatórios</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Insights financeiros
          </h1>
          <p className="text-sm text-muted-foreground">
            Burn rate, runway, exposição cambial, aging e mais — em uma visão.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <CurrencySelector value={currency} onChange={setCurrency} />
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-2"
            onClick={refresh}
            title="Atualizar dados"
          >
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="insights" className="w-full">
        <TabsList variant="line" className="w-full justify-start gap-4 border-b border-border/60 pb-0 overflow-x-auto">
          <TabsTrigger
            value="insights"
            className="px-2 pb-3 data-active:text-primary after:bg-primary after:bottom-[-1px]"
          >
            Visão geral
          </TabsTrigger>
          <TabsTrigger
            value="cashflow"
            className="px-2 pb-3 data-active:text-primary after:bg-primary after:bottom-[-1px]"
          >
            Fluxo de caixa
          </TabsTrigger>
          <TabsTrigger
            value="by-category"
            className="px-2 pb-3 data-active:text-primary after:bg-primary after:bottom-[-1px]"
          >
            Por categoria
          </TabsTrigger>
          <TabsTrigger
            value="forecast"
            className="px-2 pb-3 data-active:text-primary after:bg-primary after:bottom-[-1px]"
          >
            Previsto vs Realizado
          </TabsTrigger>
          <TabsTrigger
            value="net-worth"
            className="px-2 pb-3 data-active:text-primary after:bg-primary after:bottom-[-1px]"
          >
            Patrimônio líquido
          </TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
            <div className="lg:col-span-4">
              <BurnRateReport currency={currency} />
            </div>
            <div className="lg:col-span-2">
              <RunwayReport currency={currency} />
            </div>

            <div className="lg:col-span-4">
              <SavingsRateReport currency={currency} />
            </div>
            <div className="lg:col-span-2">
              <TopCategoriesReport currency={currency} />
            </div>

            <div className="lg:col-span-3">
              <AgingReport currency={currency} kind="payables" />
            </div>
            <div className="lg:col-span-3">
              <AgingReport currency={currency} kind="receivables" />
            </div>

            <div className="lg:col-span-6">
              <CurrencyExposureReport />
            </div>

            <div className="lg:col-span-6">
              <NetWorthTrendReport />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cashflow" className="mt-4">
          <CashflowReport currency={currency} />
        </TabsContent>
        <TabsContent value="by-category" className="mt-4">
          <ByCategoryReport currency={currency} />
        </TabsContent>
        <TabsContent value="forecast" className="mt-4">
          <ForecastVsActualReport currency={currency} />
        </TabsContent>
        <TabsContent value="net-worth" className="mt-4">
          <NetWorthReport />
        </TabsContent>
      </Tabs>
    </div>
  )
}
