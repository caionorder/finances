import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Shield,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { useAuth } from './AuthContext'

const loginSchema = z.object({
  email: z.string().min(1, 'Informe o email').email('Email inválido'),
  password: z.string().min(1, 'Informe a senha'),
})

type LoginValues = z.infer<typeof loginSchema>
type LocationState = { from?: { pathname?: string } } | null

export function LoginPage() {
  const { user, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (user) return <Navigate to="/" replace />

  const redirectTo = (location.state as LocationState)?.from?.pathname ?? '/'

  async function onSubmit(values: LoginValues) {
    setServerError(null)
    try {
      await login(values.email, values.password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      if (isAxiosError(err)) {
        if (err.response?.status === 401) {
          setServerError('Email ou senha inválidos.')
        } else if (err.response?.data && typeof err.response.data === 'object') {
          const detail = (err.response.data as { detail?: unknown }).detail
          setServerError(typeof detail === 'string' ? detail : 'Falha ao autenticar.')
        } else {
          setServerError('Não foi possível conectar ao servidor.')
        }
      } else {
        setServerError('Erro inesperado.')
      }
    }
  }

  return (
    <div className="relative grid min-h-dvh grid-cols-1 overflow-hidden bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Theme toggle */}
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      {/* Background decorations (full-bleed) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-40" />

      {/* LEFT PANEL — Hero */}
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Glow orbs */}
        <div
          aria-hidden="true"
          className="absolute -top-32 -left-20 h-96 w-96 bg-glow-cyan opacity-50"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-0 -right-20 h-80 w-80 bg-glow-emerald opacity-30"
        />
        <div
          aria-hidden="true"
          className="absolute top-1/2 left-1/3 h-64 w-64 -translate-y-1/2 bg-glow-cyan opacity-20"
        />

        {/* Brand */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="relative grid h-11 w-11 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/40">
            <Zap className="h-5 w-5 text-primary" strokeWidth={2.25} aria-hidden="true" />
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-xl bg-primary/20 blur-md"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-base font-semibold tracking-tight text-foreground">Finances</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              v0.1 · self-hosted
            </span>
          </div>
        </div>

        {/* Headline */}
        <div className="relative z-10 max-w-xl space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-primary backdrop-blur-sm">
            <span className="status-dot status-dot-pulse bg-primary shadow-[0_0_8px_var(--color-primary)]" />
            Sistema operacional · 89 endpoints
          </div>

          <h2 className="text-4xl font-semibold leading-[1.1] tracking-tight">
            Controle <span className="bg-gradient-to-br from-primary to-success bg-clip-text text-transparent">total</span>
            <br />
            sobre suas finanças.
          </h2>

          <p className="max-w-md text-base text-muted-foreground">
            Contas, cartões, faturas e relatórios — multi-moeda, multi-usuário, com a clareza
            técnica que você precisa.
          </p>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-4 border-t border-border/40 pt-6">
            <Stat label="Moedas" value="3" />
            <Stat label="Endpoints" value="89" />
            <Stat label="Permissões" value="ACL" />
          </div>

          {/* Features */}
          <ul className="space-y-3">
            <FeatureItem
              icon={TrendingUp}
              title="Multi-moeda nativo"
              text="BRL · USD · PYG isolados, sem conversão automática."
            />
            <FeatureItem
              icon={BarChart3}
              title="Relatórios em tempo real"
              text="Cashflow, categorias, patrimônio, previsto vs realizado."
            />
            <FeatureItem
              icon={Shield}
              title="Audit trail completo"
              text="RBAC + ACL granular + log de toda mutação."
            />
          </ul>
        </div>

        {/* Footer */}
        <div className="relative z-10 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
          © {new Date().getFullYear()} · Built with Claude Code
        </div>
      </div>

      {/* RIGHT PANEL — Form */}
      <div className="relative flex items-center justify-center p-6 sm:p-12">
        {/* Glass form card */}
        <div className="relative w-full max-w-md">
          {/* Glow behind card */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-glow-cyan opacity-20"
          />

          <div className="relative rounded-2xl border border-border/60 bg-card/80 p-8 shadow-pop backdrop-blur-xl">
            {/* Mobile brand */}
            <div className="mb-6 flex items-center gap-2.5 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
                <Zap className="h-5 w-5 text-primary" strokeWidth={2.25} aria-hidden="true" />
              </div>
              <span className="text-lg font-semibold tracking-tight">Finances</span>
            </div>

            <div className="space-y-2 mb-6">
              <div className="font-mono text-[10px] uppercase tracking-widest text-primary">
                Login
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Acessar painel</h1>
              <p className="text-sm text-muted-foreground">
                Entre com seu email e senha pra continuar.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Email
                </Label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="voce@exemplo.com"
                    {...register('email')}
                    aria-invalid={Boolean(errors.email)}
                    className="h-11 border-border/80 bg-background/50 pl-10 font-mono text-sm transition-colors focus:border-primary"
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Senha
                </Label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...register('password')}
                    aria-invalid={Boolean(errors.password)}
                    className="h-11 border-border/80 bg-background/50 pl-10 pr-10 font-mono text-sm transition-colors focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {serverError && (
                <div
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
                  role="alert"
                >
                  {serverError}
                </div>
              )}

              <Button
                type="submit"
                className="group relative h-11 w-full overflow-hidden text-sm font-semibold shadow-[0_0_24px_-6px_var(--color-primary)] transition-shadow hover:shadow-[0_0_32px_-4px_var(--color-primary)]"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>Autenticando…</>
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Esqueceu sua senha? Solicite um reset ao administrador.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

function FeatureItem({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Zap
  title: string
  text: string
}) {
  return (
    <li className="flex items-start gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
        <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium tracking-tight text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{text}</span>
      </div>
    </li>
  )
}
