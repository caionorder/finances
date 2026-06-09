import type { InvoiceStatus } from '@/lib/api/invoices'

/** Visual status, including the derived `overdue` tone (not stored server-side). */
export type InvoiceVisualStatus = InvoiceStatus | 'overdue'

export type StatusTone = 'muted' | 'info' | 'warning' | 'success' | 'destructive'

type StatusMeta = {
  label: string
  tone: StatusTone
  pulse?: boolean
}

export const STATUS_META: Record<InvoiceVisualStatus, StatusMeta> = {
  draft: { label: 'Rascunho', tone: 'muted' },
  issued: { label: 'Emitida', tone: 'info' },
  sent: { label: 'Enviada', tone: 'info' },
  paid: { label: 'Paga', tone: 'success' },
  void: { label: 'Anulada', tone: 'muted' },
  overdue: { label: 'Vencida', tone: 'destructive', pulse: true },
}

export const TONE_BADGE: Record<StatusTone, string> = {
  muted: 'border-border bg-muted/40 text-muted-foreground',
  info: 'border-primary/30 bg-primary/10 text-primary',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  success: 'border-success/30 bg-success/10 text-success',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
}

export const TONE_DOT: Record<StatusTone, string> = {
  muted: 'bg-muted-foreground/60',
  info: 'bg-primary shadow-[0_0_8px_var(--color-primary)]',
  warning: 'bg-warning shadow-[0_0_8px_var(--color-warning)]',
  success: 'bg-success shadow-[0_0_8px_var(--color-success)]',
  destructive: 'bg-destructive shadow-[0_0_8px_var(--color-destructive)]',
}

/**
 * Resolve the visual status from a raw status + the server-derived `overdue`
 * flag. An invoice is shown as "Vencida" only while still open (issued/sent).
 */
export function resolveVisualStatus(
  status: InvoiceStatus,
  overdue: boolean
): InvoiceVisualStatus {
  if (overdue && (status === 'issued' || status === 'sent')) return 'overdue'
  return status
}
