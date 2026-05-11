import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, Download, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  reportsApi,
  type NetWorthByCurrency,
} from '@/lib/api/reports'
import { formatCurrency } from '@/lib/currency'
import { downloadCsv } from '@/lib/csv'
import { todayISO } from './shared'

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Dinheiro',
  investment: 'Investimento',
}

function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPE_LABEL[type] ?? type
}

export function NetWorthReport() {
  const [asOf, setAsOf] = useState<string>(() => todayISO())

  const query = useQuery({
    queryKey: ['reports', 'net-worth', { as_of: asOf }],
    queryFn: () => reportsApi.netWorth({ as_of: asOf }),
    enabled: Boolean(asOf),
  })

  const data = query.data
  const groups = data?.by_currency ?? []

  function handleExport() {
    if (!data) return
    const rows: {
      moeda: string
      tipo: string
      nome: string
      detalhe: string
      valor: string
    }[] = []
    groups.forEach((g) => {
      g.accounts.forEach((a) => {
        rows.push({
          moeda: g.currency,
          tipo: 'conta',
          nome: a.name,
          detalhe: accountTypeLabel(a.type),
          valor: a.balance,
        })
      })
      g.credit_cards.forEach((cc) => {
        rows.push({
          moeda: g.currency,
          tipo: 'cartao',
          nome: cc.name,
          detalhe: cc.available_credit
            ? `crédito disponível: ${cc.available_credit}`
            : '',
          valor: cc.cycle_total,
        })
      })
      rows.push({
        moeda: g.currency,
        tipo: 'TOTAL',
        nome: '',
        detalhe: '',
        valor: g.net,
      })
    })
    downloadCsv(
      rows,
      ['moeda', 'tipo', 'nome', 'detalhe', 'valor'],
      `patrimonio-liquido_${asOf}.csv`
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-soft">
        <div className="space-y-1">
          <span className="block font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Em
          </span>
          <Input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="h-9 w-[160px] border-border/60 font-mono tabular-nums"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="ml-auto h-9"
          onClick={handleExport}
          disabled={!data || groups.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {query.isLoading ? (
        <div className="h-[200px] w-full animate-pulse rounded-xl bg-muted/60" />
      ) : query.isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Falha ao carregar patrimônio líquido.
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/30 px-6 py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Nenhuma conta ou cartão registrado</p>
          <p className="text-xs text-muted-foreground">
            Cadastre contas e cartões para acompanhar seu patrimônio.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <CurrencyGroupCard key={g.currency} group={g} />
          ))}
        </div>
      )}
    </div>
  )
}

function CurrencyGroupCard({ group }: { group: NetWorthByCurrency }) {
  const net = parseFloat(group.net)
  const positive = net >= 0
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/40 p-5">
        <div className="space-y-1">
          <div className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {group.currency}
          </div>
          <p
            className={`font-mono text-3xl font-semibold tracking-tight tabular-nums ${
              positive ? 'text-success' : 'text-destructive'
            }`}
          >
            {formatCurrency(group.net, group.currency)}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1">
              Contas:{' '}
              <span className="tabular-nums text-foreground">
                {formatCurrency(group.accounts_total, group.currency)}
              </span>
            </span>
            <span className="flex items-center gap-1">
              Cartões:{' '}
              <span className="tabular-nums text-foreground">
                −{formatCurrency(group.credit_cards_total, group.currency)}
              </span>
            </span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 divide-y divide-border/40 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <div className="p-5">
          <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <Wallet className="h-3 w-3 text-primary" strokeWidth={2.25} />
            <span>Contas</span>
          </div>
          {group.accounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma conta nesta moeda.</p>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="border-b border-border/40 hover:bg-transparent">
                  <TableHead className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Nome
                  </TableHead>
                  <TableHead className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Tipo
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Saldo
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.accounts.map((a) => {
                  const balance = parseFloat(a.balance)
                  return (
                    <TableRow
                      key={a.account_id}
                      className="border-b border-border/40 transition-colors hover:bg-accent/30"
                    >
                      <TableCell className="px-3 py-2 text-sm">{a.name}</TableCell>
                      <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                        {accountTypeLabel(a.type)}
                      </TableCell>
                      <TableCell
                        className={`px-3 py-2 text-right font-mono text-sm tabular-nums ${
                          balance >= 0 ? 'text-success' : 'text-destructive'
                        }`}
                      >
                        {formatCurrency(a.balance, group.currency)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="p-5">
          <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <CreditCard className="h-3 w-3 text-primary" strokeWidth={2.25} />
            <span>Cartões de crédito</span>
          </div>
          {group.credit_cards.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum cartão nesta moeda.
            </p>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="border-b border-border/40 hover:bg-transparent">
                  <TableHead className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Nome
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Ciclo aberto
                  </TableHead>
                  <TableHead className="px-3 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Crédito disp.
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.credit_cards.map((cc) => (
                  <TableRow
                    key={cc.credit_card_id}
                    className="border-b border-border/40 transition-colors hover:bg-accent/30"
                  >
                    <TableCell className="px-3 py-2 text-sm">{cc.name}</TableCell>
                    <TableCell className="px-3 py-2 text-right font-mono text-sm tabular-nums">
                      {formatCurrency(cc.cycle_total, group.currency)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-mono text-sm tabular-nums text-muted-foreground">
                      {cc.available_credit
                        ? formatCurrency(cc.available_credit, group.currency)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  )
}
