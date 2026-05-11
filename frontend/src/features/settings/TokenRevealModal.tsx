import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string | null
  keyName?: string | null
}

export function TokenRevealModal({ open, onOpenChange, token, keyName }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      toast.success('Chave copiada')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Falha ao copiar')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setCopied(false)
      }}
    >
      <DialogContent className="sm:max-w-2xl border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Chave criada
            {keyName ? (
              <span className="text-muted-foreground"> · {keyName}</span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Use esta chave em integrações externas via header{' '}
            <code className="rounded-md border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-xs">
              X-API-Key
            </code>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="font-medium">Visualização única</p>
            <p className="leading-snug text-warning/90">
              Esta é a única vez que você verá essa chave. Copie e guarde em
              local seguro — ela não poderá ser recuperada depois.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Token
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-border/60 bg-muted px-3 py-2 font-mono text-sm tracking-tight text-foreground">
              {token ?? '—'}
            </code>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopy}
              disabled={!token}
              aria-label="Copiar chave"
              className="h-10"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4 text-success" />
                  Copiada
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar
                </>
              )}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            className="transition-shadow hover:shadow-[0_0_24px_-6px_var(--color-primary)]"
          >
            Entendi, fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
