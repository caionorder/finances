import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, Plus, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TransactionFilters } from './TransactionFilters'
import { TransactionTable } from './TransactionTable'
import { TransactionFormDialog } from './TransactionFormDialog'
import { TransferFormDialog } from './TransferFormDialog'
import type { TransactionFilters as Filters } from '@/lib/api/transactions'
import type { TransactionOut } from '@/lib/api/transactions'

const EMPTY_FILTERS: Filters = {}

export function TransactionsPage() {
  const [searchParams] = useSearchParams()
  const accountIdParam = searchParams.get('account_id')

  const [filters, setFilters] = useState<Filters>(() =>
    accountIdParam ? { account_id: Number(accountIdParam) } : EMPTY_FILTERS
  )

  useEffect(() => {
    if (!accountIdParam) return
    const id = Number(accountIdParam)
    if (!Number.isNaN(id)) {
      setFilters((prev) => ({ ...prev, account_id: id }))
    }
  }, [accountIdParam])

  const [createOpen, setCreateOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [editing, setEditing] = useState<TransactionOut | null>(null)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Receipt className="h-3 w-3 text-primary" />
            <span>Transações</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Transações
          </h1>
          <p className="text-sm text-muted-foreground">
            Lance receitas, despesas e transferências entre contas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setTransferOpen(true)}
            className="shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]"
          >
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            Nova transferência
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            className="shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova transação
          </Button>
        </div>
      </div>

      <TransactionFilters value={filters} onChange={setFilters} />

      <TransactionTable filters={filters} onEdit={setEditing} />

      <TransactionFormDialog
        open={createOpen || editing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setCreateOpen(false)
            setEditing(null)
          }
        }}
        transaction={editing}
      />

      <TransferFormDialog open={transferOpen} onOpenChange={setTransferOpen} />
    </div>
  )
}
