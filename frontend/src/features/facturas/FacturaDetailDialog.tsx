import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Download, FileText, FileWarning, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  downloadFacturaFile,
  facturasApi,
  type FacturaOut,
  type FacturaType,
} from '@/lib/api/facturas'
import { formatCurrency } from '@/lib/currency'

type Props = {
  factura: FacturaOut | null
  onClose: () => void
  onEdit: (f: FacturaOut) => void
  categoryMap: Map<number, string>
}

export function FacturaDetailDialog({
  factura,
  onClose,
  onEdit,
  categoryMap,
}: Props) {
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const isImage = (factura?.file_mime ?? '').startsWith('image/')
  const isPdf = factura?.file_mime === 'application/pdf'

  useEffect(() => {
    if (!factura || !factura.has_file) {
      setPreviewUrl(null)
      setPreviewError(null)
      return
    }
    let cancelled = false
    let createdUrl: string | null = null
    setPreviewLoading(true)
    setPreviewError(null)

    facturasApi
      .fetchFileBlob(factura.id)
      .then((blob) => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        createdUrl = url
        setPreviewUrl(url)
      })
      .catch(() => {
        if (cancelled) return
        setPreviewError('Não foi possível carregar o anexo.')
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
      setPreviewUrl(null)
    }
  }, [factura])

  const deleteMutation = useMutation({
    mutationFn: (id: number) => facturasApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] })
      toast.success('Factura excluída')
      setConfirmDelete(false)
      onClose()
    },
    onError: (err) => {
      toast.error(extractError(err, 'Falha ao excluir factura.'))
    },
  })

  async function handleDownload() {
    if (!factura) return
    try {
      const filename = buildDownloadFilename(factura)
      await downloadFacturaFile(factura.id, filename)
    } catch (err) {
      toast.error(extractError(err, 'Falha ao baixar arquivo.'))
    }
  }

  if (!factura) return null

  const categoryName = factura.category_id
    ? categoryMap.get(factura.category_id) ?? `#${factura.category_id}`
    : null

  return (
    <Dialog
      open={factura !== null}
      onOpenChange={(next) => {
        if (!next) {
          setConfirmDelete(false)
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            <span>Factura</span>
            <span className="font-mono tabular-nums">{factura.number}</span>
            <TypeBadge type={factura.type} />
          </DialogTitle>
          <DialogDescription className="font-mono text-xs text-muted-foreground">
            {factura.supplier_name} · RUC{' '}
            <span className="text-foreground">{factura.ruc}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-xl border border-border/60 bg-background/40 p-4 sm:grid-cols-2">
          <Field label="Data" value={formatDate(factura.date)} mono />
          <Field
            label="Total"
            value={formatCurrency(factura.total, factura.currency_code)}
            mono
            emphasis
          />
          <Field
            label="IVA 5%"
            value={formatCurrency(factura.iva_5, factura.currency_code)}
            mono
          />
          <Field
            label="IVA 10%"
            value={formatCurrency(factura.iva_10, factura.currency_code)}
            mono
          />
          <Field
            label="Isento"
            value={formatCurrency(factura.exempt, factura.currency_code)}
            mono
          />
          <Field label="Moeda" value={factura.currency_code} mono />
          <Field label="Categoria" value={categoryName ?? '—'} />
          <Field label="Criada em" value={formatDateTime(factura.created_at)} mono />
        </div>

        {factura.notes ? (
          <div className="space-y-2">
            <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Notas
            </p>
            <p className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              {factura.notes}
            </p>
          </div>
        ) : null}

        {factura.has_file ? (
          <div className="space-y-2">
            <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Anexo
            </p>
            <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/30">
              {previewLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  <span className="ml-3">Carregando anexo...</span>
                </div>
              ) : previewError ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-destructive">
                  <FileWarning className="h-5 w-5" />
                  {previewError}
                </div>
              ) : previewUrl && isImage ? (
                <img
                  src={previewUrl}
                  alt="Anexo da factura"
                  className="mx-auto max-h-[480px] w-auto"
                />
              ) : previewUrl && isPdf ? (
                <iframe
                  src={previewUrl}
                  title="Anexo da factura"
                  className="h-[480px] w-full"
                />
              ) : previewUrl ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-5 w-5" />
                  Pré-visualização indisponível para este tipo de arquivo.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {confirmDelete ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Tem certeza? Esta operação é permanente.
          </div>
        ) : null}

        <DialogFooter className="flex-wrap gap-2">
          {factura.has_file ? (
            <Button type="button" variant="outline" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Baixar arquivo
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => onEdit(factura)}>
            Editar
          </Button>
          {confirmDelete ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => deleteMutation.mutate(factura.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Excluindo...' : 'Confirmar exclusão'}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TypeBadge({ type }: { type: FacturaType }) {
  if (type === 'issued') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-primary">
        Emitida
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-success">
      Recebida
    </span>
  )
}

function Field({
  label,
  value,
  mono,
  emphasis,
}: {
  label: string
  value: string
  mono?: boolean
  emphasis?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className={[
          mono ? 'font-mono tabular-nums' : '',
          emphasis ? 'text-base font-semibold' : 'text-sm',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </p>
    </div>
  )
}

function formatDate(value: string): string {
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function formatDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('pt-BR')
}

function buildDownloadFilename(f: FacturaOut): string {
  const ext = extensionFromMime(f.file_mime)
  const safeNumber = f.number.replace(/[^a-zA-Z0-9-_]/g, '_')
  return `factura-${f.type}-${safeNumber}${ext}`
}

function extensionFromMime(mime: string | null): string {
  switch (mime) {
    case 'application/pdf':
      return '.pdf'
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    default:
      return ''
  }
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
