import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApp } from '@/state/app'

export function ViewOverlay({
  title,
  eyebrow,
  action,
  children
}: {
  title: string
  eyebrow?: string
  action?: ReactNode
  children: ReactNode
}) {
  const app = useApp()
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      className="scroll-area absolute inset-0 z-40 overflow-y-auto bg-bg pb-28"
    >
      <div className="safe-top sticky top-0 z-10 border-b border-line/[0.06] bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-4 md:px-8">
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-faint">{eyebrow}</p>}
            <h1 className="truncate font-serif text-2xl font-semibold italic tracking-tight text-fg">{title}</h1>
          </div>
          {action}
          <button
            onClick={() => app.setView('map')}
            aria-label="返回地图"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line/10 text-muted transition hover:text-fg"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-5 pt-8 md:px-8">{children}</div>
    </motion.div>
  )
}
