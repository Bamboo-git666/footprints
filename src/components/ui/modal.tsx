import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  className?: string
  showClose?: boolean
}

export function Modal({ open, onClose, title, children, className, showClose = true }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className={cn(
              'panel-glass relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line/[0.08] shadow-float sm:max-w-lg sm:rounded-3xl',
              className
            )}
          >
            {title !== undefined && (
              <div className="flex items-center justify-between gap-4 px-6 pb-2 pt-5">
                <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                {showClose && (
                  <button
                    onClick={onClose}
                    className="-mr-2 rounded-full p-2 text-muted transition hover:bg-line/[0.08] hover:text-fg"
                    aria-label="关闭"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}
            <div className="scroll-area min-h-0 overflow-y-auto px-6 pb-6 pt-2">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
