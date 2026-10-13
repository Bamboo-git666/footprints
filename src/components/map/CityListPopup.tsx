import { motion } from 'framer-motion'
import { ChevronRight, Maximize2 } from 'lucide-react'
import type { CityGroup } from '@/lib/cities'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { cn } from '@/lib/utils'

function Cover({ id }: { id: string }) {
  const thumb = useBlobUrl(id, 'thumb')
  if (thumb) return <img src={thumb} alt="" draggable={false} className="h-full w-full object-cover" />
  return <div className="h-full w-full animate-pulse bg-line/10" />
}

/**
 * 全球聚合点点击后的城市列表弹层：
 * 展示聚合内每座城市的封面、名称与照片数，点击城市直接打开完整相册；
 * 「放大查看分布」为次要操作，不作为浏览照片的必经步骤。
 */
export function CityListPopup({
  cities,
  x,
  y,
  onPick,
  onZoom,
  onClose
}: {
  cities: CityGroup[]
  x: number
  y: number
  onPick: (group: CityGroup) => void
  onZoom: () => void
  onClose: () => void
}) {
  if (cities.length === 0) return null
  const total = cities.reduce((n, g) => n + g.photos.length, 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      style={{ left: x, top: y }}
      className="absolute z-30 w-[272px] -translate-x-1/2 -translate-y-[calc(100%+26px)]"
    >
      <div className="overflow-hidden rounded-3xl border border-line/10 bg-surface/85 shadow-float backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-line/[0.06] px-4 py-2.5">
          <p className="text-xs font-medium text-muted">
            {cities.length} 座城市 · {total} 张照片
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            aria-label="关闭城市列表"
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted transition hover:bg-line/[0.08] hover:text-fg"
          >
            ×
          </button>
        </div>
        <div className="scroll-area max-h-[240px] overflow-y-auto p-1.5">
          {cities.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onPick(g)
              }}
              className="group flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition hover:bg-line/[0.06]"
            >
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-line/10">
                <Cover id={g.coverId} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{g.city}</p>
                <p className="mt-0.5 truncate text-[11px] text-faint">
                  {[g.region, g.country].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-accent',
                  'transition group-hover:bg-accent group-hover:text-accent-fg'
                )}
              >
                {g.photos.length}
              </span>
              <ChevronRight size={15} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onZoom()
          }}
          className="flex w-full items-center justify-center gap-1.5 border-t border-line/[0.06] py-2.5 text-xs font-medium text-muted transition hover:bg-line/[0.04] hover:text-fg"
        >
          <Maximize2 size={13} />
          放大查看城市分布
        </button>
      </div>
    </motion.div>
  )
}
