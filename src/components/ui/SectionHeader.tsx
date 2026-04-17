import { HTMLAttributes } from 'react'

type Tone = 'default' | 'red' | 'teal' | 'gold'

interface SectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  num?: string | number
  label: string
  count?: number
  sub?: string
  tone?: Tone
}

const toneColor: Record<Tone, string> = {
  default: 'text-ink border-ink',
  red:     'text-brand-red border-brand-red',
  teal:    'text-brand-teal-ink border-brand-teal-ink',
  gold:    'text-brand-gold-ink border-brand-gold-ink',
}

export default function SectionHeader({
  num,
  label,
  count,
  sub,
  tone = 'default',
  className = '',
  ...props
}: SectionHeaderProps) {
  return (
    <div className={`flex items-baseline gap-4 flex-wrap ${className}`} {...props}>
      {num != null && (
        <div className={`text-[11px] font-extrabold tracking-[0.15em] uppercase pt-1 border-t-2 ${toneColor[tone]}`}>
          № {String(num).padStart(2, '0')}
        </div>
      )}
      <div className="text-[26px] font-bold tracking-[-0.03em] text-ink italic leading-none">
        {label}
      </div>
      {count != null && (
        <div className="text-[13px] text-ink-lo font-semibold tabular-nums">
          {count}
        </div>
      )}
      {sub && (
        <div className="ml-auto text-[11px] text-ink-lo uppercase tracking-[0.1em] font-bold">
          {sub}
        </div>
      )}
    </div>
  )
}
