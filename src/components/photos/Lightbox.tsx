import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Info, MapPin, Pencil, Trash2, X, ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { useApp } from '@/state/app'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { Button } from '@/components/ui/button'
import { formatBytes, formatDate, formatTime } from '@/lib/utils'
import type { BlobKind } from '@/types'

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-6 border-b border-line/[0.07] py-2.5 last:border-0">
      <span className="shrink-0 text-xs text-faint">{label}</span>
      <span className="text-right text-xs text-fg">{value}</span>
    </div>
  )
}

export function Lightbox() {
  const app = useApp()
  const lb = app.lightbox
  const photo = lb ? app.photoMap.get(lb.photoIds[lb.index]) ?? null : null

  const [kind, setKind] = useState<BlobKind>('medium')
  const [originalBusy, setOriginalBusy] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [scale, setScale] = useState(1)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const url = useBlobUrl(photo?.id, kind)

  // 切换照片时重置视图
  useEffect(() => {
    setKind('medium')
    setShowInfo(false)
    setScale(1)
    setConfirmDelete(false)
  }, [lb?.photoIds[lb?.index ?? 0]])

  useEffect(() => {
    if (!lb) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') app.closeLightbox()
      if (e.key === 'ArrowRight') app.stepLightbox(1)
      if (e.key === 'ArrowLeft') app.stepLightbox(-1)
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(4, s + 0.5))
      if (e.key === '-') setScale((s) => Math.max(1, s - 0.5))
      if (e.key === '0') setScale(1)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [lb, app])

  const loadOriginal = () => {
    if (kind === 'original') return
    setOriginalBusy(true)
    setKind('original')
    // URL 会话缓存就绪通常很快；短暂保底延时用于 spinner
    setTimeout(() => setOriginalBusy(false), 350)
  }

  return createPortal(
    <AnimatePresence>
      {lb && photo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[80] flex flex-col bg-black/97"
        >
          {/* 顶栏 */}
          <div className="safe-top pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-12 pt-4">
            <div className="pointer-events-auto min-w-0">
              <p className="truncate text-sm font-medium text-white">{photo.name || placeFallback(photo.placeName, photo.city)}</p>
              <p className="text-xs text-white/55">
                {formatDate(photo.takenAt)} {formatTime(photo.takenAt)}
              </p>
            </div>
            <div className="pointer-events-auto flex items-center gap-1.5">
              <IconBtn label="信息" onClick={() => setShowInfo((v) => !v)} active={showInfo}><Info size={18} /></IconBtn>
              <IconBtn label="编辑" onClick={() => app.openEditor(photo.id)}><Pencil size={17} /></IconBtn>
              <IconBtn label="删除" danger onClick={() => (confirmDelete ? void app.deletePhoto(photo.id) : setConfirmDelete(true))}>
                <Trash2 size={17} />
              </IconBtn>
              <IconBtn label="关闭" onClick={app.closeLightbox}><X size={20} /></IconBtn>
            </div>
          </div>

          {/* 图片 */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            <div
              className="relative flex h-full w-full items-center justify-center"
              onDoubleClick={() => setScale((s) => (s === 1 ? 2 : 1))}
              onWheel={(e) => setScale((s) => Math.min(4, Math.max(1, s - Math.sign(e.deltaY) * 0.25)))}
            >
              {url && !originalBusy ? (
                <motion.img
                  key={`${photo.id}-${kind}`}
                  src={url}
                  alt={photo.name || photo.fileName}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, scale }}
                  transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                  draggable={false}
                  className="max-h-full max-w-full select-none object-contain"
                  style={{ cursor: scale > 1 ? 'zoom-out' : 'zoom-in' }}
                />
              ) : (
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
              )}
            </div>

            {lb.photoIds.length > 1 && (
              <>
                <button
                  onClick={() => app.stepLightbox(-1)}
                  aria-label="上一张"
                  className="absolute left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur transition hover:bg-white/20 hover:text-white"
                >
                  <ChevronLeft size={22} />
                </button>
                <button
                  onClick={() => app.stepLightbox(1)}
                  aria-label="下一张"
                  className="absolute right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur transition hover:bg-white/20 hover:text-white"
                >
                  <ChevronRight size={22} />
                </button>
              </>
            )}

            {/* 缩放控制 */}
            <div className="absolute bottom-20 right-4 z-10 flex items-center gap-1 rounded-full bg-white/10 px-1 py-1 backdrop-blur md:bottom-6">
              <IconBtn small label="缩小" onClick={() => setScale((s) => Math.max(1, s - 0.5))}><ZoomOut size={16} /></IconBtn>
              <span className="w-11 text-center text-xs tabular-nums text-white/70">{Math.round(scale * 100)}%</span>
              <IconBtn small label="放大" onClick={() => setScale((s) => Math.min(4, s + 0.5))}><ZoomIn size={16} /></IconBtn>
              <IconBtn small label="重置" onClick={() => setScale(1)}><RotateCcw size={15} /></IconBtn>
            </div>
          </div>

          {/* 底栏 */}
          <div className="safe-bottom pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-5 pb-5 pt-10">
            <div className="pointer-events-auto min-w-0">
              {photo.note && <p className="mb-1 max-w-md truncate text-xs text-white/70">{photo.note}</p>}
              {photo.lat !== null && photo.lng !== null && (
                <button
                  onClick={() => {
                    app.closeLightbox()
                    app.setView('map')
                    app.requestMapFocus(photo.lng!, photo.lat!, 16)
                  }}
                  className="flex items-center gap-1 text-xs text-white/55 transition hover:text-accent"
                  title="在地图上查看拍摄位置"
                >
                  <MapPin size={11} />
                  {photo.lat.toFixed(5)}, {photo.lng.toFixed(5)}
                  <span className="text-white/35">· 前往地图</span>
                </button>
              )}
            </div>
            <div className="pointer-events-auto flex items-center gap-3">
              {kind === 'medium' ? (
                <button onClick={loadOriginal} className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/75 transition hover:bg-white/10">
                  查看原图 · {formatBytes(photo.size)}
                </button>
              ) : (
                <span className="rounded-full border border-accent/40 px-3 py-1.5 text-xs text-accent">原始文件</span>
              )}
              <span className="text-xs tabular-nums text-white/55">
                {lb.index + 1} / {lb.photoIds.length}
              </span>
            </div>
          </div>

          {/* 删除确认 */}
          <AnimatePresence>
            {confirmDelete && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-danger/40 bg-danger/15 px-4 py-3 backdrop-blur-xl"
              >
                <span className="text-sm text-white">确认删除这张照片？原件与元数据将一并移除。</span>
                <Button size="sm" variant="danger" onClick={() => void app.deletePhoto(photo.id)}>删除</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>取消</Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* EXIF 侧栏 */}
          <AnimatePresence>
            {showInfo && (
              <motion.aside
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 340, damping: 36 }}
                className="panel-glass absolute right-0 top-0 z-20 flex h-full w-[340px] max-w-[88vw] flex-col border-l border-white/10"
              >
                <div className="flex items-center justify-between px-5 pb-2 pt-16">
                  <h3 className="text-base font-semibold text-fg">照片信息</h3>
                  <button onClick={() => setShowInfo(false)} className="rounded-full p-2 text-muted hover:text-fg" aria-label="关闭信息面板">
                    <X size={18} />
                  </button>
                </div>
                <div className="scroll-area px-5 pb-10">
                  <InfoRow label="名称" value={photo.name} />
                  <InfoRow label="备注" value={photo.note} />
                  <InfoRow label="拍摄时间" value={`${formatDate(photo.takenAt)} ${formatTime(photo.takenAt)}`} />
                  <InfoRow label="地点" value={photo.placeName} />
                  <InfoRow label="城市" value={photo.city} />
                  <InfoRow label="国家 / 地区" value={photo.country} />
                  <InfoRow label="坐标" value={photo.lat !== null && photo.lng !== null ? `${photo.lat.toFixed(6)}, ${photo.lng.toFixed(6)}` : '未定位'} />
                  <div className="h-3" />
                  <InfoRow label="相机" value={photo.camera} />
                  <InfoRow label="镜头" value={photo.lens} />
                  <InfoRow label="焦距" value={photo.focalLength ? `${trimNum(photo.focalLength)} mm` : null} />
                  <InfoRow label="光圈" value={photo.fNumber ? `f/${trimNum(photo.fNumber)}` : null} />
                  <InfoRow label="快门" value={photo.exposureTime ? `${photo.exposureTime} s` : null} />
                  <InfoRow label="ISO" value={photo.iso ? String(photo.iso) : null} />
                  <div className="h-3" />
                  <InfoRow label="尺寸" value={`${photo.width} × ${photo.height}`} />
                  <InfoRow label="文件大小" value={formatBytes(photo.size)} />
                  <InfoRow label="格式" value={photo.fileType} />
                  <InfoRow label="文件名" value={photo.fileName} />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function placeFallback(...vals: Array<string | null>): string {
  return vals.find(Boolean) ?? '未命名照片'
}

function IconBtn({
  children, onClick, label, active, danger, small
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  active?: boolean
  danger?: boolean
  small?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        'flex items-center justify-center rounded-full text-white/70 transition hover:bg-white/15 hover:text-white ' +
        (small ? 'h-8 w-8' : 'h-10 w-10') +
        (active ? ' bg-white/20 text-white' : '') +
        (danger ? ' hover:bg-danger/30 hover:text-danger' : '')
      }
    >
      {children}
    </button>
  )
}
