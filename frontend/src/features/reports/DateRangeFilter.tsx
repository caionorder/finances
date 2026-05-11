import { Input } from '@/components/ui/input'

type Props = {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
}

export function DateRangeFilter({ from, to, onFromChange, onToChange }: Props) {
  return (
    <>
      <div className="space-y-1">
        <span className="block font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          De
        </span>
        <Input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="h-9 w-[150px] border-border/60 font-mono tabular-nums"
        />
      </div>
      <div className="space-y-1">
        <span className="block font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Até
        </span>
        <Input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="h-9 w-[150px] border-border/60 font-mono tabular-nums"
        />
      </div>
    </>
  )
}
