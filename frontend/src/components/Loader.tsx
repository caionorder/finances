import { useEffect, useState } from 'react'
import { RotateCcw, Zap } from 'lucide-react'

export function FullScreenLoader({ label = 'Carregando' }: { label?: string }) {
  const [showEscape, setShowEscape] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShowEscape(true), 1500)
    return () => clearTimeout(t)
  }, [])

  function resetSession() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    window.location.replace('/login')
  }

  return (
    <div className="relative grid h-dvh place-items-center bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-30"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-72 w-72 bg-glow-cyan opacity-30"
      />

      <div className="relative flex flex-col items-center gap-4">
        <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
          <Zap
            className="h-6 w-6 animate-pulse text-primary"
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 animate-ping rounded-2xl bg-primary/20"
            style={{ animationDuration: '2s' }}
          />
        </div>
        <div className="space-y-1 text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
          <div className="flex items-center justify-center gap-1">
            <span
              className="h-1 w-1 animate-bounce rounded-full bg-primary"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="h-1 w-1 animate-bounce rounded-full bg-primary"
              style={{ animationDelay: '120ms' }}
            />
            <span
              className="h-1 w-1 animate-bounce rounded-full bg-primary"
              style={{ animationDelay: '240ms' }}
            />
          </div>
        </div>

        {/* Escape hatch após 1.5s — pra sessão travada */}
        {showEscape && (
          <button
            type="button"
            onClick={resetSession}
            className="mt-4 inline-flex animate-fade-in items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          >
            <RotateCcw className="h-3 w-3" />
            Limpar sessão e fazer login
          </button>
        )}
      </div>
    </div>
  )
}
