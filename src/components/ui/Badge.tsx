import { HTMLAttributes } from 'react'

type BadgeTone = 'default' | 'red' | 'teal' | 'gold' | 'ink' | 'mute'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

const tones: Record<BadgeTone, string> = {
  default: 'bg-paper-deep text-ink-mid',
  red:     'bg-brand-red text-brand-red-ink',
  teal:    'bg-brand-teal text-brand-teal-ink',
  gold:    'bg-brand-gold text-brand-gold-ink',
  ink:     'bg-ink text-white',
  mute:    'bg-paper-deep text-ink-lo',
}

export default function Badge({ tone = 'default', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
