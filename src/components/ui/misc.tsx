import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-line/10 bg-line/[0.05] px-2.5 py-0.5 text-xs font-medium text-muted',
        className
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn('animate-spin text-current', className)}
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      {icon && <div className="mb-5 text-faint">{icon}</div>}
      <h3 className="text-balance text-lg font-semibold text-fg">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-balance text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
