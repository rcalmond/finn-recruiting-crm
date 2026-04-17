import { HTMLAttributes } from 'react'

type Tone = 'default' | 'warning' | 'success' | 'urgent'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone
}

const tones: Record<Tone, string> = {
  default: 'bg-white border border-line',
  warning: 'bg-brand-gold border border-brand-gold-deep',
  success: 'bg-brand-teal border border-brand-teal-deep',
  urgent:  'bg-brand-red border border-brand-red-deep',
}

export default function Card({ tone = 'default', className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-lg shadow-card ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
