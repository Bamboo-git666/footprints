import { useEffect, useSyncExternalStore, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, X } from 'lucide-react'
import { getImportState, subscribeImport } from '@/lib/import'

export function ImportProgress() {
  const s = useSyncExternalStore(subscribeImport, getImportState)
  const [dismissed, setDismissed] = useState(false)

  // 新一轮导入时重新出现；全部成功时 8 秒后自动收起，避免遮挡地图操作
  useEffect(() => {
    if (s.running) setDismissed(false)
  }, [s.running, s.total])

  useEffect(() => {
    if (s.total > 0 && !s.running && s.failed === 0 && s.errors.length === 0) {
      const t = setTimeout(() => setDismissed(true), 8000)
      return () => clearTimeout(t)
    }
  }, [s.running, s.failed, s.errors.length, s.total, s.total > 0])

  if (s.total === 0) return null

  const percent = s.running ? Math.round((s.processed / s.total) * 100) : 100
  const done = !s.running
  const show = !dismissed
  if (done && dismissed) return null

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="panel-glass fixed bottom-24 left-1/2 z-[95] w-[min(92vw,440px)] -translate-x-1/2 rounded-3xl border border-line/10 px-5 py-4 shadow-float md:bottom-8"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {s.running ? (
                <Loader2 size={18} className="animate-spin text-accent" />
              ) : s.failed > 0 ? (
                <AlertTriangle size={18} className="text-danger" />
              ) : (
                <CheckCircle2 size={18} className="text-accent" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">
                {s.running ? `正在导入… ${s.processed}/${s.total}` : '导入完成'}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {s.running ? s.currentName : `成功 ${s.added} 张 · 重复 ${s.duplicates} · 待定位 ${s.pending}${s.failed ? ` · 失败 ${s.failed}` : ''}${s.unsupported ? ` · 不支持 ${s.unsupported}` : ''}`}
              </p>
              {s.heicHint && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-faint">
                  <ImagePlus size={11} /> HEIC 照片正在自动转换，速度可能稍慢
                </p>
              )}
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-line/10">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {!s.running && s.errors.length > 0 && (
                <div className="scroll-area mt-2 max-h-20 space-y-1 overflow-y-auto">
                  {s.errors.map((e, i) => (
                    <p key={i} className="text-[11px] text-danger/90">{e.name}：{e.reason}</p>
                  ))}
                </div>
              )}
              {!s.running && s.pending > 0 && (
                <button
                  className="mt-2.5 text-xs font-medium text-accent"
                  onClick={() => window.dispatchEvent(new CustomEvent('footprints:pending'))}
                >
                  有 {s.pending} 张照片待定位，去处理 →
                </button>
              )}
            </div>
            {done && (
              <button onClick={() => setDismissed(true)} className="shrink-0 text-faint hover:text-fg" aria-label="关闭">
                <X size={16} />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
