import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  MoreHorizontal,
  Plus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  investmentsApi,
  type MovementOut,
  type MovementType,
} from '@/lib/api/investments'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { DeleteMovementDialog } from './DeleteMovementDialog'
import { InvestmentFormDialog } from './InvestmentFormDialog'
import { MovementFormDialog } from './MovementFormDialog'
import {
  addMonthsISO,
  formatDateBR,
  INDEX_REF_LABEL,
  INVESTMENT_TYPE_LABEL,
  LIQUIDITY_LABEL,
  MOVEMENT_LABEL,
  MOVEMENT_TONE,
  RATE_KIND_LABEL,
  RATE_PERIOD_LABEL,
  toneClass,
  todayISO,
  TYPE_TONE,
} from './shared'

export function InvestmentDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id ? Number(params.id) : NaN

  const [movementOpen, setMovementOpen] = useState(false)
  const [movementInitialType, setMovementInitialType] =
    useState<MovementType>('deposit')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MovementOut | null>(null)
  const [projectUntil, setProjectUntil] = useState<string>(() =>
    addMonthsISO(todayISO(), 12)
  )

  const investmentQuery = useQuery({
    queryKey: ['investment', id],
    queryFn: () => investmentsApi.get(id),
    enabled: Number.isFinite(id),
  })

  const positionQuery = useQuery({
    queryKey: ['investment-position', id],
    queryFn: () => investmentsApi.position(id),
    enabled: Number.isFinite(id),
  })

  const movementsQuery = useQuery({
    queryKey: ['investment-movements', id],
    queryFn: () => investmentsApi.listMovements(id),
    enabled: Number.isFinite(id),
  })

  const projectionQuery = useQuery({
    queryKey: ['investment-projection', id, projectUntil],
    queryFn: () => investmentsApi.projection(id, projectUntil),
    enabled: Number.isFinite(id) && Boolean(projectUntil),
  })

  const investment = investmentQuery.data
  const position = positionQuery.data

  const sortedMovements = useMemo(() => {
    if (!movementsQuery.data) return []
    return [...movementsQuery.data].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date)
      return b.id - a.id
    })
  }, [movementsQuery.data])

  const movementTotals = useMemo(() => {
    let deposit = 0
    let withdrawal = 0
    let interest = 0
    for (const m of sortedMovements) {
      const v = parseFloat(m.amount)
      if (Number.isNaN(v)) continue
      if (m.type === 'deposit') deposit += v
      else if (m.type === 'withdrawal') withdrawal += v
      else interest += v
    }
    return { deposit, withdrawal, interest }
  }, [sortedMovements])

  const projectionData = useMemo(() => {
    if (!projectionQuery.data) return []
    return projectionQuery.data.points.map((p) => ({
      date: p.date,
      label: formatDateBR(p.date),
      value: parseFloat(p.value),
    }))
  }, [projectionQuery.data])

  if (!Number.isFinite(id)) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-6 text-sm text-destructive">
        ID de investimento inválido.
      </div>
    )
  }

  if (investmentQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted/60" />
        <div className="h-40 w-full animate-pulse rounded-xl bg-muted/60" />
      </div>
    )
  }

  if (investmentQuery.isError || !investment) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-6 text-sm text-destructive">
        Falha ao carregar investimento.{' '}
        <Link to="/investments" className="underline">
          Voltar
        </Link>
      </div>
    )
  }

  const gainNum = position ? parseFloat(position.gross_gain) : 0
  const gainPercentNum = position ? parseFloat(position.gain_percent) : 0
  const isPositive = gainNum >= 0
  const GainIcon = isPositive ? TrendingUp : TrendingDown
  const gainTone = isPositive ? 'text-success' : 'text-destructive'
  const tone = TYPE_TONE[investment.type]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="mt-1.5 h-9 w-9"
          >
            <Link to="/investments" aria-label="Voltar">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-primary" />
              <span>Investimento</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {investment.name}
              </h1>
              <span
                className={cn(
                  'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
                  toneClass(tone)
                )}
              >
                {INVESTMENT_TYPE_LABEL[investment.type]}
              </span>
              <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {investment.currency_code}
              </span>
              {investment.is_archived ? (
                <span className="inline-flex items-center rounded-md border border-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Arquivado
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Início{' '}
              <span className="font-mono font-medium tabular-nums text-foreground">
                {formatDateBR(investment.start_date)}
              </span>
              {investment.maturity_date ? (
                <>
                  {' · '}
                  Vence{' '}
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {formatDateBR(investment.maturity_date)}
                  </span>
                </>
              ) : null}
              {' · '}
              {LIQUIDITY_LABEL[investment.liquidity]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            Editar
          </Button>
        </div>
      </div>

      {/* Hero card */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft">
        <div className="absolute -right-14 -top-14 h-56 w-56 rounded-full bg-glow-cyan opacity-30 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-44 w-44 rounded-full bg-glow-emerald opacity-15 blur-3xl" />

        <div className="relative space-y-6 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Posição atual ·{' '}
                <span className="text-foreground">
                  {formatDateBR(position?.as_of ?? todayISO())}
                </span>
              </span>
              <p className="font-mono text-4xl font-semibold tracking-tight tabular-nums text-foreground sm:text-5xl">
                {positionQuery.isLoading
                  ? '—'
                  : formatCurrency(
                      position?.current_value ?? '0',
                      investment.currency_code
                    )}
              </p>
              <div
                className={cn(
                  'flex items-center gap-2 text-sm font-medium',
                  gainTone
                )}
              >
                <GainIcon className="h-4 w-4" strokeWidth={2.25} />
                <span className="font-mono tabular-nums">
                  {isPositive ? '+' : ''}
                  {formatCurrency(
                    position?.gross_gain ?? '0',
                    investment.currency_code
                  )}
                </span>
                <span className="font-mono tabular-nums opacity-80">
                  ({isPositive ? '+' : ''}
                  {Number.isFinite(gainPercentNum)
                    ? gainPercentNum.toFixed(2)
                    : '0.00'}
                  %)
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => {
                  setMovementInitialType('deposit')
                  setMovementOpen(true)
                }}
                disabled={investment.is_archived}
                className="shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_28px_-4px_var(--color-primary)]"
              >
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Aporte
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setMovementInitialType('withdrawal')
                  setMovementOpen(true)
                }}
                disabled={investment.is_archived}
              >
                <ArrowDownRight className="mr-2 h-4 w-4" />
                Resgate
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-border/40 pt-4 md:grid-cols-4">
            <Stat
              label="Aplicado"
              value={formatCurrency(
                position?.total_invested ?? '0',
                investment.currency_code
              )}
            />
            <Stat
              label="Resgatado"
              value={formatCurrency(
                position?.total_withdrawn ?? '0',
                investment.currency_code
              )}
            />
            <Stat
              label="Rendimento"
              value={formatCurrency(
                position?.gross_gain ?? '0',
                investment.currency_code
              )}
              tone={gainTone}
            />
            <Stat
              label="Dias decorridos"
              value={
                position
                  ? new Intl.NumberFormat('pt-BR').format(position.days_elapsed)
                  : '—'
              }
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue="movements" className="space-y-4">
        <TabsList variant="line" className="border-b border-border/60">
          <TabsTrigger
            value="movements"
            className="data-active:text-primary data-active:after:!bg-primary"
          >
            Movimentos
          </TabsTrigger>
          <TabsTrigger
            value="projection"
            className="data-active:text-primary data-active:after:!bg-primary"
          >
            Projeção
          </TabsTrigger>
          <TabsTrigger
            value="details"
            className="data-active:text-primary data-active:after:!bg-primary"
          >
            Detalhes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="movements" className="space-y-3">
          <MovementsTable
            movements={sortedMovements}
            currencyCode={investment.currency_code}
            isLoading={movementsQuery.isLoading}
            onDelete={(m) => setDeleteTarget(m)}
            totals={movementTotals}
            onNew={() => {
              setMovementInitialType('deposit')
              setMovementOpen(true)
            }}
            disabled={investment.is_archived}
          />
        </TabsContent>

        <TabsContent value="projection" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-soft">
            <div className="space-y-1.5">
              <Label
                htmlFor="projection-until"
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
              >
                Projetar até
              </Label>
              <Input
                id="projection-until"
                type="date"
                value={projectUntil}
                onChange={(e) => setProjectUntil(e.target.value)}
                className="h-9 w-44 border-border/80 bg-background/50 font-mono"
              />
            </div>
            <div className="flex gap-2">
              {[6, 12, 24, 60].map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setProjectUntil(addMonthsISO(todayISO(), m))}
                  className="h-9 font-mono text-xs"
                >
                  +{m}m
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-soft">
            {projectionQuery.isLoading ? (
              <div className="grid h-[320px] place-items-center text-sm text-muted-foreground">
                Calculando projeção...
              </div>
            ) : projectionQuery.isError ? (
              <div className="grid h-[320px] place-items-center text-sm text-destructive">
                Falha ao carregar projeção.
              </div>
            ) : projectionData.length === 0 ? (
              <div className="grid h-[320px] place-items-center text-sm text-muted-foreground">
                Sem dados para projetar.
              </div>
            ) : (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={projectionData}
                    margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <filter
                        id="glowPrimary"
                        x="-50%"
                        y="-50%"
                        width="200%"
                        height="200%"
                      >
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="2 4"
                      vertical={false}
                      stroke="var(--color-border)"
                      strokeOpacity={0.6}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{
                        fontSize: 11,
                        fill: 'var(--color-muted-foreground)',
                        fontFamily: 'var(--font-mono)',
                      }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      tick={{
                        fontSize: 10,
                        fill: 'var(--color-muted-foreground)',
                        fontFamily: 'var(--font-mono)',
                      }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) =>
                        new Intl.NumberFormat('pt-BR', {
                          notation: 'compact',
                          maximumFractionDigits: 1,
                        }).format(v)
                      }
                      width={56}
                    />
                    <Tooltip
                      cursor={{
                        stroke: 'var(--color-primary)',
                        strokeOpacity: 0.4,
                      }}
                      contentStyle={{
                        backgroundColor: 'var(--color-popover)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        boxShadow: 'var(--shadow-pop)',
                      }}
                      labelStyle={{
                        color: 'var(--color-foreground)',
                        fontWeight: 600,
                        fontFamily: 'var(--font-sans)',
                      }}
                      formatter={(v) =>
                        typeof v === 'number'
                          ? formatCurrency(v, investment.currency_code)
                          : v
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      filter="url(#glowPrimary)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {projectionData.length > 0 ? (
            <ProjectionTable
              data={projectionData}
              currencyCode={investment.currency_code}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="details" className="space-y-3">
          <DetailsGrid investment={investment} />
        </TabsContent>
      </Tabs>

      <MovementFormDialog
        open={movementOpen}
        onOpenChange={setMovementOpen}
        investmentId={id}
        currencyCode={investment.currency_code}
        initialType={movementInitialType}
      />

      <DeleteMovementDialog
        investmentId={id}
        movement={deleteTarget}
        currencyCode={investment.currency_code}
        onClose={() => setDeleteTarget(null)}
      />

      <InvestmentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        investment={
          investment
            ? ({
                ...investment,
                total_invested: position?.total_invested ?? '0',
                total_withdrawn: position?.total_withdrawn ?? '0',
                current_value: position?.current_value ?? '0',
                gross_gain: position?.gross_gain ?? '0',
                gain_percent: position?.gain_percent ?? '0',
              } as Parameters<typeof InvestmentFormDialog>[0]['investment'])
            : null
        }
      />
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="space-y-1">
      <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <p
        className={cn(
          'font-mono text-lg font-semibold tracking-tight tabular-nums',
          tone ?? 'text-foreground'
        )}
      >
        {value}
      </p>
    </div>
  )
}

const headCellClass =
  'h-10 bg-muted/40 px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground'

type MovementsTableProps = {
  movements: MovementOut[]
  currencyCode: string
  isLoading: boolean
  onDelete: (m: MovementOut) => void
  totals: { deposit: number; withdrawal: number; interest: number }
  onNew: () => void
  disabled: boolean
}

function MovementsTable({
  movements,
  currencyCode,
  isLoading,
  onDelete,
  totals,
  onNew,
  disabled,
}: MovementsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="space-y-0.5">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Movimentos
          </span>
          <p className="text-xs text-muted-foreground">
            Aportes, resgates e créditos de juros registrados.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onNew}
          disabled={disabled}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Novo
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-b border-border/60 hover:bg-transparent">
            <TableHead className={`${headCellClass} w-[110px]`}>Data</TableHead>
            <TableHead className={`${headCellClass} w-[120px]`}>Tipo</TableHead>
            <TableHead className={`${headCellClass} text-right`}>
              Valor
            </TableHead>
            <TableHead className={headCellClass}>Notas</TableHead>
            <TableHead className={`${headCellClass} w-[60px] text-right`}>
              Ações
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow className="border-b border-border/40">
              <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                Carregando movimentos...
              </TableCell>
            </TableRow>
          ) : movements.length === 0 ? (
            <TableRow className="border-b border-border/40">
              <TableCell colSpan={5} className="py-10 text-center">
                <p className="text-sm font-medium">Nenhum movimento ainda</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Registre um aporte ou resgate para começar.
                </p>
              </TableCell>
            </TableRow>
          ) : (
            movements.map((m) => {
              const movementTone = MOVEMENT_TONE[m.type]
              const isWithdraw = m.type === 'withdrawal'
              return (
                <TableRow
                  key={m.id}
                  className="border-b border-border/40 transition-colors hover:bg-accent/30"
                >
                  <TableCell className="px-4 py-3 font-mono tabular-nums">
                    {formatDateBR(m.date)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
                        toneClass(movementTone)
                      )}
                    >
                      {MOVEMENT_LABEL[m.type]}
                    </span>
                  </TableCell>
                  <TableCell
                    className={cn(
                      'px-4 py-3 text-right font-mono font-medium tabular-nums',
                      isWithdraw && 'text-destructive'
                    )}
                  >
                    {isWithdraw ? '−' : ''}
                    {formatCurrency(m.amount, currencyCode)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                    {m.notes ?? '—'}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Ações"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => onDelete(m)}
                          className="text-destructive focus:text-destructive"
                        >
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
        {movements.length > 0 ? (
          <TableFooter>
            <TableRow className="border-t border-border/60 bg-muted/30 hover:bg-muted/30">
              <TableCell colSpan={2} className="px-4 py-3 text-xs text-muted-foreground">
                <span className="font-mono uppercase tracking-widest">
                  Aportes{' '}
                  <span className="font-medium tabular-nums text-success">
                    {formatCurrency(totals.deposit, currencyCode)}
                  </span>
                  {' · '}
                  Resgates{' '}
                  <span className="font-medium tabular-nums text-destructive">
                    {formatCurrency(totals.withdrawal, currencyCode)}
                  </span>
                  {' · '}
                  Juros{' '}
                  <span className="font-medium tabular-nums text-primary">
                    {formatCurrency(totals.interest, currencyCode)}
                  </span>
                </span>
              </TableCell>
              <TableCell
                colSpan={3}
                className="px-4 py-3 text-right font-mono font-semibold tabular-nums"
              >
                Líquido aplicado{' '}
                <span className="ml-2">
                  {formatCurrency(
                    totals.deposit - totals.withdrawal,
                    currencyCode
                  )}
                </span>
              </TableCell>
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
  )
}

function ProjectionTable({
  data,
  currencyCode,
}: {
  data: { date: string; label: string; value: number }[]
  currencyCode: string
}) {
  const sampled = useMemo(() => {
    if (data.length <= 13) return data
    const step = Math.ceil(data.length / 13)
    const out: typeof data = []
    for (let i = 0; i < data.length; i += step) out.push(data[i])
    if (out[out.length - 1]?.date !== data[data.length - 1].date) {
      out.push(data[data.length - 1])
    }
    return out
  }, [data])

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border/60 hover:bg-transparent">
            <TableHead className={headCellClass}>Data</TableHead>
            <TableHead className={`${headCellClass} text-right`}>
              Valor projetado
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sampled.map((p) => (
            <TableRow
              key={p.date}
              className="border-b border-border/40 transition-colors hover:bg-accent/30"
            >
              <TableCell className="px-4 py-2.5 font-mono tabular-nums">
                {p.label}
              </TableCell>
              <TableCell className="px-4 py-2.5 text-right font-mono tabular-nums">
                {formatCurrency(p.value, currencyCode)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function DetailsGrid({
  investment,
}: {
  investment: import('@/lib/api/investments').InvestmentOut
}) {
  const entries: { label: string; value: React.ReactNode; mono?: boolean }[] = [
    {
      label: 'Tipo',
      value: INVESTMENT_TYPE_LABEL[investment.type],
    },
    { label: 'Moeda', value: investment.currency_code, mono: true },
    {
      label: 'Valor inicial',
      value: formatCurrency(investment.principal, investment.currency_code),
      mono: true,
    },
    {
      label: 'Data inicial',
      value: formatDateBR(investment.start_date),
      mono: true,
    },
    {
      label: 'Vencimento',
      value: formatDateBR(investment.maturity_date),
      mono: true,
    },
    {
      label: 'Taxa',
      value: investment.rate_value + '%',
      mono: true,
    },
    {
      label: 'Período da taxa',
      value: RATE_PERIOD_LABEL[investment.rate_period],
    },
    {
      label: 'Tipo de taxa',
      value: RATE_KIND_LABEL[investment.rate_kind],
    },
    {
      label: 'Indexador',
      value: investment.index_ref
        ? INDEX_REF_LABEL[investment.index_ref]
        : '—',
      mono: true,
    },
    {
      label: 'Liquidez',
      value: LIQUIDITY_LABEL[investment.liquidity],
    },
    {
      label: 'Conta vinculada',
      value: investment.account_id ?? '—',
      mono: true,
    },
    {
      label: 'Criado em',
      value: investment.created_at.slice(0, 10),
      mono: true,
    },
  ]

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-soft">
      <div className="border-b border-border/40 p-5">
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Parâmetros do investimento
        </div>
        <h3 className="mt-1 text-[15px] font-semibold tracking-tight">
          Detalhes
        </h3>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2 md:grid-cols-3">
        {entries.map((e) => (
          <div key={e.label} className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {e.label}
            </span>
            <p
              className={cn(
                'text-sm',
                e.mono && 'font-mono tabular-nums text-foreground'
              )}
            >
              {e.value}
            </p>
          </div>
        ))}
      </div>
      {investment.notes ? (
        <div className="border-t border-border/40 p-5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Notas
          </span>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
            {investment.notes}
          </p>
        </div>
      ) : null}
    </div>
  )
}
