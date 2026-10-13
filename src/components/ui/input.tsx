import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const fieldCls =
  'w-full rounded-2xl border border-line/10 bg-elevated/70 px-4 py-2.5 text-sm text-fg placeholder:text-faint outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/15'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldCls, className)} {...props} />
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(fieldCls, 'resize-none', className)} {...props} />
)
Textarea.displayName = 'Textarea'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted', className)} {...props} />
}
