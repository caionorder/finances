import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { isAxiosError } from 'axios'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Paperclip,
  UploadCloud,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CategoryCombobox } from '@/features/categories/CategoryCombobox'
import {
  facturasApi,
  type FacturaOut,
  type FacturaType,
} from '@/lib/api/facturas'
import { cn } from '@/lib/utils'

const NO_CATEGORY = '__none__'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ACCEPTED_MIMES = ['application/pdf', 'image/jpeg', 'image/png']
const ACCEPTED_EXTS = ['.pdf', '.jpg', '.jpeg', '.png']

const decimalString = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d+)?$/, 'Informe um valor válido')

const positiveDecimalString = decimalString.refine(
  (v) => parseFloat(v.replace(',', '.')) > 0,
  { message: 'O valor deve ser maior que zero' }
)

const optionalDecimal = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d+([.,]\d+)?$/.test(v), {
    message: 'Informe um valor válido',
  })

const schema = z.object({
  type: z.enum(['received', 'issued'] as const),
  number: z.string().trim().min(1, 'Informe o número'),
  ruc: z.string().trim().min(1, 'Informe o RUC'),
  supplier_name: z.string().trim().min(1, 'Informe o fornecedor'),
  date: z.string().min(1, 'Informe a data'),
  total: positiveDecimalString,
  iva_5: optionalDecimal,
  iva_10: optionalDecimal,
  exempt: optionalDecimal,
  category_id: z.string(),
  notes: z.string().max(1000).optional(),
})

type FormValues = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  factura?: FacturaOut | null
}

const inputClass =
  'h-10 border-border/80 bg-background/50 transition-colors focus:border-primary'
const labelClass =
  'text-xs font-medium uppercase tracking-wider text-muted-foreground'

export function FacturaFormDialog({
  open,
  onOpenChange,
  factura,
}: Props) {
  const isEdit = Boolean(factura)
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [removeFile, setRemoveFile] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValuesFor(null),
  })

  useEffect(() => {
    if (!open) {
      setServerError(null)
      setFile(null)
      setFileError(null)
      setRemoveFile(false)
      setDragActive(false)
      return
    }
    form.reset(defaultValuesFor(factura ?? null))
    setFile(null)
    setFileError(null)
    setRemoveFile(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, factura])

  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      if (isEdit && factura) {
        return facturasApi.update(factura.id, formData)
      }
      return facturasApi.create(formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturas'] })
      toast.success(isEdit ? 'Factura atualizada' : 'Factura criada')
      onOpenChange(false)
    },
    onError: (err) => {
      const status = isAxiosError(err) ? err.response?.status : undefined
      const fallback =
        status === 409
          ? 'Já existe uma factura com este tipo, número e RUC.'
          : 'Não foi possível salvar a factura.'
      const msg = extractError(err, fallback)
      setServerError(msg)
      toast.error(msg)
    },
  })

  const totalNum = parseDecimal(form.watch('total'))
  const iva5Num = parseDecimal(form.watch('iva_5'))
  const iva10Num = parseDecimal(form.watch('iva_10'))
  const exemptNum = parseDecimal(form.watch('exempt'))
  const taxesSum = iva5Num + iva10Num + exemptNum
  const totalsMismatch =
    !Number.isNaN(totalNum) &&
    totalNum > 0 &&
    taxesSum > 0 &&
    Math.abs(totalNum - taxesSum) > 1

  function onSubmit(values: FormValues) {
    setServerError(null)
    if (file) {
      const validation = validateFile(file)
      if (validation) {
        setFileError(validation)
        return
      }
    }

    const fd = new FormData()
    fd.append('type', values.type)
    fd.append('number', values.number.trim())
    fd.append('ruc', values.ruc.trim())
    fd.append('supplier_name', values.supplier_name.trim())
    fd.append('date', values.date)
    fd.append('total', normalizeDecimal(values.total))
    fd.append('iva_5', normalizeDecimal(values.iva_5 || '0'))
    fd.append('iva_10', normalizeDecimal(values.iva_10 || '0'))
    fd.append('exempt', normalizeDecimal(values.exempt || '0'))
    if (values.category_id && values.category_id !== NO_CATEGORY) {
      fd.append('category_id', values.category_id)
    }
    if (values.notes) fd.append('notes', values.notes)
    if (file) fd.append('file', file)
    if (isEdit && removeFile && !file) fd.append('remove_file', 'true')

    mutation.mutate(fd)
  }

  function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    const f = list[0]
    const validation = validateFile(f)
    if (validation) {
      setFileError(validation)
      setFile(null)
      return
    }
    setFile(f)
    setFileError(null)
    setRemoveFile(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            {isEdit ? 'Editar factura' : 'Nova factura'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEdit
              ? 'Atualize os dados da factura paraguaia.'
              : 'Cadastre uma factura recebida ou emitida em PYG.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className={labelClass}>Tipo</Label>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => field.onChange(v as FacturaType)}
                  >
                    <SelectTrigger className={inputClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="received">Recebida</SelectItem>
                      <SelectItem value="issued">Emitida</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fac-date" className={labelClass}>
                Data
              </Label>
              <Input
                id="fac-date"
                type="date"
                className={cn(inputClass, 'font-mono tabular-nums')}
                {...form.register('date')}
              />
              {form.formState.errors.date ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.date.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="fac-number" className={labelClass}>
                Número
              </Label>
              <Input
                id="fac-number"
                placeholder="001-001-0001234"
                className={cn(inputClass, 'font-mono')}
                {...form.register('number')}
              />
              {form.formState.errors.number ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.number.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="fac-ruc" className={labelClass}>
                RUC
              </Label>
              <Input
                id="fac-ruc"
                placeholder="80012345-6"
                className={cn(inputClass, 'font-mono')}
                {...form.register('ruc')}
              />
              {form.formState.errors.ruc ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.ruc.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="fac-supplier" className={labelClass}>
                Fornecedor
              </Label>
              <Input
                id="fac-supplier"
                className={inputClass}
                {...form.register('supplier_name')}
              />
              {form.formState.errors.supplier_name ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.supplier_name.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="fac-total" className={labelClass}>
                Total (PYG)
              </Label>
              <Input
                id="fac-total"
                inputMode="decimal"
                placeholder="0"
                className={cn(inputClass, 'font-mono tabular-nums')}
                {...form.register('total')}
              />
              {form.formState.errors.total ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.total.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="fac-iva5" className={labelClass}>
                IVA 5%
              </Label>
              <Input
                id="fac-iva5"
                inputMode="decimal"
                placeholder="0"
                className={cn(inputClass, 'font-mono tabular-nums')}
                {...form.register('iva_5')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fac-iva10" className={labelClass}>
                IVA 10%
              </Label>
              <Input
                id="fac-iva10"
                inputMode="decimal"
                placeholder="0"
                className={cn(inputClass, 'font-mono tabular-nums')}
                {...form.register('iva_10')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fac-exempt" className={labelClass}>
                Isento
              </Label>
              <Input
                id="fac-exempt"
                inputMode="decimal"
                placeholder="0"
                className={cn(inputClass, 'font-mono tabular-nums')}
                {...form.register('exempt')}
              />
            </div>
          </div>

          {totalsMismatch ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="leading-snug">
                A soma de IVA 5%, IVA 10% e isento (
                <span className="font-mono tabular-nums">{formatPyg(taxesSum)}</span>
                ) não bate com o total{' '}
                <span className="font-mono tabular-nums">{formatPyg(totalNum)}</span>.
                Verifique antes de salvar.
              </span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label className={labelClass}>Categoria (opcional)</Label>
            <Controller
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <CategoryCombobox
                  value={
                    field.value && field.value !== NO_CATEGORY
                      ? Number(field.value)
                      : null
                  }
                  onChange={(next) =>
                    field.onChange(next == null ? NO_CATEGORY : String(next))
                  }
                  kind="expense"
                  placeholder="Sem categoria"
                />
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fac-notes" className={labelClass}>
              Notas
            </Label>
            <Textarea
              id="fac-notes"
              rows={2}
              className="border-border/80 bg-background/50 transition-colors focus:border-primary"
              {...form.register('notes')}
            />
          </div>

          <div className="space-y-2">
            <Label className={labelClass}>Anexo · PDF, JPG ou PNG (máx 10 MB)</Label>
            <Dropzone
              file={file}
              existingFileName={
                isEdit && factura?.has_file && !removeFile && !file
                  ? buildExistingFileLabel(factura)
                  : null
              }
              existingMime={isEdit && factura ? factura.file_mime : null}
              dragActive={dragActive}
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                handleFiles(e.dataTransfer.files)
              }}
              onSelectFile={handleFiles}
              onRemove={() => {
                setFile(null)
                setFileError(null)
                if (isEdit && factura?.has_file) setRemoveFile(true)
              }}
            />
            {fileError ? (
              <p className="text-xs text-destructive">{fileError}</p>
            ) : null}
          </div>

          {serverError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="transition-shadow hover:shadow-[0_0_24px_-6px_var(--color-primary)]"
            >
              {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type DropzoneProps = {
  file: File | null
  existingFileName: string | null
  existingMime: string | null
  dragActive: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onSelectFile: (list: FileList | null) => void
  onRemove: () => void
}

function Dropzone({
  file,
  existingFileName,
  existingMime,
  dragActive,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelectFile,
  onRemove,
}: DropzoneProps) {
  const inputId = 'fac-file-input'
  const hasContent = Boolean(file || existingFileName)

  return (
    <div
      className={cn(
        'rounded-xl border border-dashed transition-colors',
        dragActive
          ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
          : 'border-border/60 bg-muted/30 hover:border-primary/60',
        hasContent && 'border-solid border-border/60 bg-card'
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        id={inputId}
        type="file"
        className="hidden"
        accept={ACCEPTED_EXTS.join(',')}
        onChange={(e) => onSelectFile(e.target.files)}
      />
      {file ? (
        <FileRow
          mime={file.type}
          name={file.name}
          size={formatBytes(file.size)}
          onRemove={onRemove}
        />
      ) : existingFileName ? (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <FileMimeIcon mime={existingMime} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{existingFileName}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Anexo atual
              </span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => document.getElementById(inputId)?.click()}
            >
              Trocar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
              Remover
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => document.getElementById(inputId)?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 px-4 py-8 text-center"
        >
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <UploadCloud className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <p className="text-sm">
            <span className="font-medium text-primary">Clique para enviar</span>{' '}
            <span className="text-muted-foreground">ou arraste o arquivo aqui</span>
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            PDF · JPG · PNG · até 10 MB
          </p>
        </button>
      )}
    </div>
  )
}

function FileRow({
  mime,
  name,
  size,
  onRemove,
}: {
  mime: string
  name: string
  size: string
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-primary/5 p-3 ring-1 ring-primary/20">
      <FileMimeIcon mime={mime} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {size}
        </span>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={onRemove}
        aria-label="Remover"
        className="h-8 w-8 shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

function FileMimeIcon({ mime }: { mime: string | null }) {
  if (mime?.startsWith('image/')) {
    return (
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-success/15 text-success ring-1 ring-success/30">
        <ImageIcon className="h-4 w-4" strokeWidth={2.25} />
      </div>
    )
  }
  if (mime === 'application/pdf') {
    return (
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive ring-1 ring-destructive/30">
        <FileText className="h-4 w-4" strokeWidth={2.25} />
      </div>
    )
  }
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
      <Paperclip className="h-4 w-4" strokeWidth={2.25} />
    </div>
  )
}

function defaultValuesFor(factura: FacturaOut | null): FormValues {
  if (!factura) {
    return {
      type: 'received',
      number: '',
      ruc: '',
      supplier_name: '',
      date: today(),
      total: '',
      iva_5: '',
      iva_10: '',
      exempt: '',
      category_id: NO_CATEGORY,
      notes: '',
    }
  }
  return {
    type: factura.type,
    number: factura.number,
    ruc: factura.ruc,
    supplier_name: factura.supplier_name,
    date: factura.date,
    total: factura.total,
    iva_5: factura.iva_5,
    iva_10: factura.iva_10,
    exempt: factura.exempt,
    category_id: factura.category_id ? String(factura.category_id) : NO_CATEGORY,
    notes: factura.notes ?? '',
  }
}

function buildExistingFileLabel(f: FacturaOut): string {
  if (f.file_path) {
    const parts = f.file_path.split('/')
    return parts[parts.length - 1] || f.file_path
  }
  return 'Anexo existente'
}

function validateFile(f: File): string | null {
  if (f.size > MAX_FILE_SIZE) return 'Arquivo maior que 10 MB.'
  const lower = f.name.toLowerCase()
  const extOk = ACCEPTED_EXTS.some((ext) => lower.endsWith(ext))
  const mimeOk = ACCEPTED_MIMES.includes(f.type)
  if (!extOk && !mimeOk) return 'Formato inválido. Use PDF, JPG ou PNG.'
  return null
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function normalizeDecimal(v: string): string {
  return v.trim().replace(',', '.') || '0'
}

function parseDecimal(v: string | undefined): number {
  if (!v) return 0
  const n = parseFloat(v.trim().replace(',', '.'))
  return Number.isNaN(n) ? 0 : n
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatPyg(value: number): string {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(value)
}

function extractError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
