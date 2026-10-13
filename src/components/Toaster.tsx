import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useApp } from '@/state/app'
import { cn } from '@/lib/utils'

export function Toaster() {
  const app = useApp()
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[100] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col items-center gap-2 md:bottom-10">
      <AnimatePresence>
        {app.toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className={cn(
              'pointer-events-auto flex w-full items-start gap-3 rounded-2xl border px-4 py-3 shadow-float panel-glass',
              t.tone === 'success' && 'border-accent/30',
              t.tone === 'error' && 'border-danger/30'
            )}
          >
            {t.tone === 'success' ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-accent" />
            ) : t.tone === 'error' ? (
              <XCircle size={18} className="mt-0.5 shrink-0 text-danger" />
            ) : (
              <Info size={18} className="mt-0.5 shrink-0 text-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.description}</p>}
            </div>
            <button onClick={() => app.dismissToast(t.id)} className="shrink-0 text-faint hover:text-fg" aria-label="关闭提示">
              <X size={15} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
