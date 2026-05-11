import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  keyName: string | null
  pending?: boolean
  onConfirm: () => void
}

export function RevokeKeyDialog({
  open,
  onOpenChange,
  keyName,
  pending,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border/60 bg-card backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Revogar chave
          </DialogTitle>
          <DialogDescription>
            {keyName ? (
              <>
                Revogar a chave{' '}
                <span className="font-mono text-foreground">"{keyName}"</span>?
              </>
            ) : (
              'Revogar esta chave?'
            )}{' '}
            Aplicações usando essa chave perderão acesso imediatamente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
          <span className="leading-snug">
            Esta ação não pode ser desfeita.
          </span>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Revogando...' : 'Revogar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
