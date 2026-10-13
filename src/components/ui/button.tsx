import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.97] select-none',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:brightness-110 shadow-marker',
        secondary: cn(
          'panel-glass border border-line/10 text-fg hover:bg-line/[0.06]'
        ),
        ghost: 'text-muted hover:text-fg hover:bg-line/[0.06]',
        danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25'
      },
      size: {
        sm: 'h-8 px-3.5 text-[13px]',
        md: 'h-10 px-5',
        lg: 'h-12 px-7 text-[15px]',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
)
Button.displayName = 'Button'
