import { ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'tertiary' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-full border-none cursor-pointer transition-colors duration-150 leading-none whitespace-nowrap'

const variants: Record<Variant, string> = {
  primary:   'bg-ink text-white hover:bg-ink-soft',
  secondary: 'bg-transparent text-ink border border-line-2 hover:bg-paper-deep',
  tertiary:  'bg-transparent text-ink-lo hover:text-ink',
  danger:    'bg-brand-red text-brand-red-ink hover:bg-brand-red-deep',
}

const sizes: Record<Size, string> = {
  sm: 'text-[12px] px-3 py-1.5',
  md: 'text-[13px] px-4 py-2',
  lg: 'text-[15px] px-5 py-3',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'
export default Button
