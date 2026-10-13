import { useMemo, useState } from 'react'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ArrowUpRight, Images, MapPin, NotebookPen } from 'lucide-react'
import { useApp } from '@/state/app'
import { ViewOverlay } from '@/components/layout/ViewOverlay'
import { EmptyState } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { ymd, formatRange, formatDateShort, cn } from '@/lib/utils'
import { isLocated } from '@/lib/geo'
import type { Photo } from '@/types'

interface Group {
  key: string
  year: number
  month: number
  cityKey: string
  title: string
  photos: Photo[]
}

function groupPhotos(photos: Photo[]): Group[] {
  const map = new Map<string, Group>()
  for (const p of photos) {
    const { year, month } = ymd(p.takenAt)
    const cityKey = p.city || p.placeName || '__unknown__'
    const key = `${year}-${month}-${cityKey}`
    let g = map.get(key)
    if (!g) {
      g = { key, year, month, cityKey, title: p.city || p.placeName || '未命名地点', photos: [] }
      map.set(key, g)
    }
    g.photos.push(p)
  }
  return Array.from(map.values()).sort((a, b) => b.photos[0].takenAt - a.photos[0].takenAt)
}

/** 方向分类：横图跨两列放大，竖图单列自然高度，方图占一格 */
function orientationOf(p: Photo): 'wide' | 'tall' | 'square' {
  if (!p.width || !p.height) return 'square'
  const r = p.width / p.height
  if (r > 1.25) return 'wide'
  if (r < 0.8) return 'tall'
  return 'square'
}

/** 回忆页缩略图：保持原始比例不裁切；hover 显示拍摄日期与定位按钮 */
function MemoryThumb({
  photo,
  onOpen,
  onLocate
}: {
  photo: Photo
  onOpen: () => void
  onLocate?: () => void
}) {
  const thumb = useBlobUrl(photo.id, 'thumb')
  const ratio = photo.width && photo.height ? photo.width / photo.height : 4 / 3
  return (
    <div
      className="photo-item group relative w-full overflow-hidden rounded-xl bg-line/[0.05]"
      style={{ aspectRatio: `${ratio}` }}
    >
      <button type="button" onClick={onOpen} className="absolute inset-0 h-full w-full" aria-label="查看照片">
        {thumb ? (
          <img
            src={thumb}
            alt={photo.name || photo.fileName}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-full w-full object-cover opacity-0 transition duration-500 group-hover:scale-[1.02] [&.loaded]:opacity-100"
            onLoad={(e) => e.currentTarget.classList.add('loaded')}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-line/10" />
        )}
        {/* 日期标注：hover 时浮现 */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-1.5 pt-6 text-[10px] font-medium tabular-nums text-white opacity-0 transition group-hover:opacity-100">
          {formatDateShort(photo.takenAt)}
        </span>
      </button>
      {/* 定位到地图拍摄位置 */}
      {onLocate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onLocate()
          }}
          aria-label="在地图上查看拍摄位置"
          title="在地图上查看拍摄位置"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition hover:bg-accent group-hover:opacity-100"
        >
          <MapPin size={13} />
        </button>
      )}
    </div>
  )
}

export function MemoriesPage() {
  const app = useApp()
  const [year, setYear] = useState<number | null>(null)
  // 排序方向：true = 最新优先（默认），false = 最早优先
  const [desc, setDesc] = useState(true)

  const photos = useMemo(
    () =>
      (year === null ? app.photos : app.photos.filter((p) => ymd(p.takenAt).year === year))
        .slice()
        .sort((a, b) => (desc ? b.takenAt - a.takenAt : a.takenAt - b.takenAt)),
    [app.photos, year, desc]
  )
  const groups = useMemo(() => {
    // 分组按组内最新一张照片的时间排序，再按全局方向翻转，保证组间顺序与排序方向一致
    const gs = groupPhotos(photos)
    return desc ? gs : [...gs].reverse()
  }, [photos, desc])
  let lastYear = -1

  const openGroup = (g: Group) => {
    const ids = g.photos.map((p) => p.id)
    const located = g.photos.filter(isLocated)
    app.setView('map')
    if (located.length) app.mapCtl.current?.fitPhotoPoints(located)
    app.openAlbum(ids)
  }

  const openLightboxAt = (g: Group, index: number) => {
    app.openLightbox(g.photos.map((p) => p.id), index)
  }

  const locatePhoto = (p: Photo) => {
    if (p.lat === null || p.lng === null) {
      app.toast('这张照片还没有位置', '可在待定位列表中为它指定坐标')
      return
    }
    app.setView('map')
    app.requestMapFocus(p.lng, p.lat, 16)
  }

  return (
    <ViewOverlay
      title="回忆相册"
      eyebrow="Memories"
      action={
        <div className="no-scrollbar hidden max-w-[40vw] items-center gap-1.5 overflow-x-auto sm:flex">
          <YearChip active={year === null} onClick={() => setYear(null)}>全部</YearChip>
          {app.years.map((y) => (
            <YearChip key={y} active={year === y} onClick={() => setYear(year === y ? null : y)}>{y}</YearChip>
          ))}
          <span className="mx-1 h-4 w-px bg-line/15" />
          <YearChip active={desc} onClick={() => setDesc(true)} title="最新拍摄在前">
            <ArrowDownWideNarrow size={13} /> 最新
          </YearChip>
          <YearChip active={!desc} onClick={() => setDesc(false)} title="最早拍摄在前">
            <ArrowUpNarrowWide size={13} /> 最早
          </YearChip>
        </div>
      }
    >
      {photos.length === 0 ? (
        <EmptyState
          icon={<Images size={30} />}
          title={app.photos.length === 0 ? '还没有任何回忆' : '这一年暂无照片'}
          description="导入照片后，这里会按照年月与城市自动整理你的旅行经历。"
          action={app.photos.length === 0 ? <Button onClick={() => window.dispatchEvent(new CustomEvent('footprints:import'))}>导入照片</Button> : undefined}
        />
      ) : (
        <div className="space-y-14">
          {groups.map((g) => {
            const sorted = [...g.photos].sort((a, b) => a.takenAt - b.takenAt)
            const showYear = g.year !== lastYear
            lastYear = g.year
            const note = g.photos.find((p) => p.note)?.note
            const n = g.photos.length
            const shown = g.photos.slice(0, 9)
            const overflow = n - shown.length
            // 少量照片时动态收紧列数，避免大块空白
            const gridCls =
              n === 1
                ? 'max-w-xl'
                : n <= 3
                  ? 'grid-cols-2'
                  : n <= 8
                    ? 'grid-cols-2 sm:grid-cols-3'
                    : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
            return (
              <section key={g.key}>
                {showYear && (
                  <p className="mb-6 font-serif text-5xl font-semibold italic tracking-tight text-fg">{g.year}</p>
                )}
                <div className="group mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line/[0.08] pb-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                      <MapPin size={17} className="text-accent" />
                      {g.title}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {formatRange(sorted[0].takenAt, sorted[sorted.length - 1].takenAt)} · {g.photos.length} 张照片
                    </p>
                    {note && (
                      <p className="mt-2 flex max-w-2xl items-start gap-1.5 text-sm leading-relaxed text-muted">
                        <NotebookPen size={14} className="mt-0.5 shrink-0 text-faint" />
                        {note}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => openGroup(g)}
                    className="flex items-center gap-1 text-sm font-medium text-accent opacity-0 transition group-hover:opacity-100 max-sm:opacity-100"
                  >
                    在地图上查看 <ArrowUpRight size={15} />
                  </button>
                </div>
                {/* 方向感知网格：横图跨两列、竖图自然高度，全部保持原始比例不裁切 */}
                <div className={cn('grid auto-rows-auto grid-flow-row-dense gap-2', gridCls)}>
                  {shown.map((p, i) => {
                    const wide = orientationOf(p) === 'wide' && n > 1
                    return (
                      <div key={p.id} className={cn(wide && 'col-span-2')}>
                        <MemoryThumb photo={p} onOpen={() => openLightboxAt(g, i)} onLocate={() => locatePhoto(p)} />
                      </div>
                    )
                  })}
                  {overflow > 0 && (
                    <button
                      onClick={() => openGroup(g)}
                      className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-line/20 bg-line/[0.03] text-sm font-medium text-muted transition hover:border-accent/40 hover:text-accent"
                    >
                      +{overflow} 张 · 全部
                    </button>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </ViewOverlay>
  )
}

function YearChip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition',
        active ? 'bg-fg text-bg' : 'border border-line/10 text-muted hover:text-fg'
      )}
    >
      {children}
    </button>
  )
}
