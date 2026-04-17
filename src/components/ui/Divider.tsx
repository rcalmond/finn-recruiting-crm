interface DividerProps {
  className?: string
}

export default function Divider({ className = '' }: DividerProps) {
  return <div className={`border-t border-line ${className}`} />
}
