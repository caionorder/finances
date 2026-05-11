import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Inbox, MoreHorizontal, Play, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  recurrencesApi,
  type RecurrenceKind,
  type RecurrenceOut,
  type RecurrenceRule,
} from '@/lib/api/recurrences'
import { cn } from '@/lib/utils'
import { describeRule } from './RecurrenceConfigForm'
import { RecurrenceEditDialog } from './RecurrenceEditDialog'
import { formatCurrency } from '@/lib/currency'

export function RecurrencesPage() {
  const [kind, setKind] = useState<RecurrenceKind>('payable')
  const [showInactive, setShowInactive] = useState<boolean>(false)
  const [editing, setEditing] = useState<RecurrenceOut | null>(null)
  const [deleting, setDeleting] = useState<RecurrenceOut | null>(null)

  return (
    <div className="relative space-y-8 animate-fade-in">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 right-16 h-56 w-56 bg-glow-cyan opacity-20"
      />

      <div className="relative space-y-2">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <Repeat className="h-3 w-3 text-primary" aria-hidden="true" />
          <span>Automação</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Recorrências
        </h1>
        <p className="text-sm text-muted-foreground">
          Regras que geram automaticamente contas a pagar e a receber.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={kind}
          onValueChange={(v) => setKind(v as RecurrenceKind)}
          className="relative"
        >
          <TabsList variant="line" className="border-b border-border/60 pb-px">
            <TabsTrigger value="payable">Pagar</TabsTrigger>
            <TabsTrigger value="receivable">Receber</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={showInactive}
            onCheckedChange={(v) => setShowInactive(Boolean(v))}
            aria-label="Mostrar inativas"
          />
          <span className="font-mono uppercase tracking-widest text-[10px]">
            Mostrar inativas
          </span>
        </label>
      </div>

      <RecurrencesTable
        kind={kind}
        showInactive={showInactive}
        onEdit={setEditing}
        onDelete={setDeleting}
      />

      <RecurrenceEditDialog
        recurrence={editing}
        onClose={() => setEditing(null)}
      />

      <DeleteRecurrenceDialog
        recurrence={deleting}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}

const TH = 'font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground'

type TableProps = {
  kind: RecurrenceKind
  showInactive: boolean
  onEdit: (rec: RecurrenceOut) => void
  onDelete: (rec: RecurrenceOut) => void
}

function RecurrencesTable({ kind, showInactive, onEdit, onDelete }: TableProps) {
  const activeFilter = showInactive ? undefined : true
  const query = useQuery({
    queryKey: ['recurrences', { kind, is_active: activeFilter ?? 'all' }],
    queryFn: () => recurrencesApi.list({ kind, is_active: activeFilter }),
  })

  const items = useMemo(() => query.data ?? [], [query.data])

  return (
    <div className="relative rounded-xl border border-border/60 bg-card shadow-soft overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border/60 bg-muted/40 hover:bg-muted/40">
            <TableHead className={TH}>Descrição</TableHead>
            <TableHead className={cn(TH, 'text-right')}>Valor</TableHead>
            <TableHead className={TH}>Frequência</TableHead>
            <TableHead className={cn(TH, 'w-[160px]')}>Próxima</TableHead>
            <TableHead className={cn(TH, 'w-[90px]')}>Ativa</TableHead>
            <TableHead className={cn(TH, 'w-[150px] text-right')}>Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="border-b border-border/40">
                {Array.from({ length: 6 }).map((__, j) => (
                  <TableCell key={j}>
                    <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : query.isError ? (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-sm text-destructive">
                Falha ao carregar recorrências.
              </TableCell>
            </TableRow>
          ) : items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-16">
                <div className="flex flex-col items-center justify-center gap-3 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
                    <Inbox className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Nenhuma recorrência cadastrada</p>
                    <p className="text-xs text-muted-foreground">
                      Crie uma a partir de uma conta com a opção "Recorrente" marcada.
                    </p>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            items.map((rec) => (
              <RecurrenceRowItem
                key={rec.id}
                recurrence={rec}
                onEdit={() => onEdit(rec)}
                onDelete={() => onDelete(rec)}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

type RowProps = {
  recurrence: RecurrenceOut
  onEdit: () => void
  onDelete: () => void
}

function RecurrenceRowItem({ recurrence, onEdit, onDelete }: RowProps) {
  const queryClient = useQueryClient()

  const template = recurrence.template_json as Record<string, unknown>
  const description =
    typeof template.description === 'string'
      ? template.description
      : '(sem descrição)'
  const amount =
    typeof template.amount === 'string' ? template.amount : null
  const currency =
    typeof template.currency_code === 'string' ? template.currency_code : null

  const ruleText = useMemo(
    () => describeRule(recurrence.rule_json as RecurrenceRule),
    [recurrence.rule_json]
  )

  const isPayable = recurrence.kind === 'payable'
  const kindToneClass = isPayable
    ? 'border-warning/30 bg-warning/10 text-warning'
    : 'border-success/30 bg-success/10 text-success'

  const toggleMutation = useMutation({
    mutationFn: (next: boolean) =>
      recurrencesApi.update(recurrence.id, { is_active: next }),
    onSuccess: (_, next) => {
      queryClient.invalidateQueries({ queryKey: ['recurrences'] })
      toast.success(next ? 'Recorrência ativada' : 'Recorrência pausada')
    },
    onError: (err) => toast.error(extractError(err, 'Falha ao atualizar.')),
  })

  const generateMutation = useMutation({
    mutationFn: () => recurrencesApi.generateNext(recurrence.id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recurrences'] })
      queryClient.invalidateQueries({ queryKey: ['payables'] })
      queryClient.invalidateQueries({ queryKey: ['receivables'] })
      if (data.generated_id) {
        toast.success('Próxima ocorrência gerada')
      } else {
        toast.info('Nenhuma ocorrência gerada (regra encerrada).')
      }
    },
    onError: (err) =>
      toast.error(extractError(err, 'Falha ao gerar próxima ocorrência.')),
  })

  return (
    <TableRow className="border-b border-border/40 transition-colors hover:bg-accent/30">
      <TableCell className="max-w-[300px] py-3">
        <div className="space-y-1">
          <p className="line-clamp-1 text-sm font-medium">{description}</p>
          <span
            className={cn(
              'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
              kindToneClass
            )}
          >
            {isPayable ? 'A pagar' : 'A receber'}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {amount && currency ? (
          <span className={cn(isPayable ? 'text-foreground' : 'text-success')}>
            {formatCurrency(amount, currency)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{ruleText}</TableCell>
      <TableCell className="font-mono text-sm tabular-nums text-muted-foreground">
        {recurrence.next_run_date ? formatDateBR(recurrence.next_run_date) : '—'}
      </TableCell>
      <TableCell>
        <Switch
          checked={recurrence.is_active}
          onCheckedChange={(v) => toggleMutation.mutate(Boolean(v))}
          disabled={toggleMutation.isPending}
          aria-label={recurrence.is_active ? 'Pausar' : 'Retomar'}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="outline"
            size="sm"
            className="border-border/80"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !recurrence.is_active}
          >
            <Play className="mr-1 h-3 w-3" strokeWidth={2.5} />
            {generateMutation.isPending ? 'Gerando...' : 'Gerar próxima'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Ações"
                className="h-8 w-8"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border/60">
              <DropdownMenuItem onSelect={onEdit}>Editar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-destructive focus:text-destructive"
              >
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}

function formatDateBR(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}

type DeleteDialogProps = {
  recurrence: RecurrenceOut | null
  onClose: () => void
}

function DeleteRecurrenceDialog({ recurrence, onClose }: DeleteDialogProps) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (id: number) => recurrencesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurrences'] })
      toast.success('Recorrência excluída')
      onClose()
    },
    onError: (err) => toast.error(extractError(err, 'Falha ao excluir.')),
  })

  const template = recurrence?.template_json as Record<string, unknown> | undefined
  const description =
    typeof template?.description === 'string' ? template.description : ''

  return (
    <Dialog
      open={recurrence !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="border-border/60 bg-card backdrop-blur-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Excluir recorrência
          </DialogTitle>
          <DialogDescription>
            A recorrência será desativada e deixará de gerar novas ocorrências.
            As contas a pagar / receber já geradas permanecem inalteradas. Você
            pode reativá-la depois usando o filtro "Mostrar inativas".
          </DialogDescription>
        </DialogHeader>
        {description ? (
          <p className="text-sm text-muted-foreground">
            Confirma excluir{' '}
            <strong className="text-foreground">{description}</strong>?
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (recurrence) mutation.mutate(recurrence.id)
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
