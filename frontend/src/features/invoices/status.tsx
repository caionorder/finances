import { cn } from '@/lib/utils'
import type { InvoiceStatus } from '@/lib/api/invoices'
import { STATUS_META, TONE_BADGE, TONE_DOT, resolveVisualStatus } from './statusMeta'

export function InvoiceStatusBadge({
  status,
  overdue = false,
  className,
}: {
  status: InvoiceStatus
  overdue?: boolean
  className?: string
}) {
  const visual = resolveVisualStatus(status, overdue)
  const meta = STATUS_META[visual]
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
        TONE_BADGE[meta.tone],
        className
      )}
    >
      <span
        className={cn(
          'status-dot h-1.5 w-1.5',
          TONE_DOT[meta.tone],
          meta.pulse && 'status-dot-pulse'
        )}
        aria-hidden="true"
      />
      {meta.label}
    </span>
  )
}
