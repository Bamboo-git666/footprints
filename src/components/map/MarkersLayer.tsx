import { useEffect, useState } from 'react'
import type { Map as MLMap } from 'maplibre-gl'
import type { BBox } from 'geojson'
import { MapPin } from 'lucide-react'
import { CityEngine, isCityCluster, type CityClusterOrPoint, type CityGroup } from '@/lib/cities'
import { isBehindGlobe } from '@/lib/geo'
import { useBlobUrlResolved } from '@/hooks/useBlobUrl'
import { cn, ymd } from '@/lib/utils'

export interface CityMarkerClick {
  kind: 'city' | 'cluster'
  /** kind === 'city' 时为被点击的城市组 */
  group: CityGroup | null
  /** 聚合点包含的全部城市（按照片数降序） */
  cities: CityGroup[]
  lng: number
  lat: number
  x: number
  y: number
  clusterId?: number
}

interface RenderItem {
  key: string
  x: number
  y: number
  lng: number
  lat: number
  /** 徽标语义：照片张数（聚合点为内部照片总数） */
  count: number
  /** 封面 photoId：单点 1 张，聚合点最多 3 张叠层 */
  covers: string[]
  group: CityGroup | null
  cities: CityGroup[]
  clusterId?: number
}

/** 聚合规模分档：尺寸适度变化，不喧宾夺主 */
function clusterTier(count: number): 0 | 1 | 2 {
  if (count >= 100) return 2
  if (count >= 10) return 1
  return 0
}

const TIER_MAIN = ['h-8 w-8', 'h-9 w-9', 'h-10 w-10'] as const
const TIER_BADGE = ['text-[9px]', 'text-[9px]', 'text-[9px]'] as const

/** 统一数量徽标：深色玻璃小签，层级始终让位于照片本身 */
function CountBadge({ count }: { count: number }) {
  return (
    <span
      className={cn(
        'absolute -bottom-1 -right-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full border border-line/25 bg-bg/85 px-1 font-semibold leading-none text-fg/90 shadow-marker backdrop-blur-sm',
        TIER_BADGE[clusterTier(count)]
      )}
    >
      {count > 999 ? '999+' : count}
    </span>
  )
}

/** 缩略图：加载中显示细腻占位，缺失时回退为优雅的位置图钉 */
function Thumb({ photoId, className }: { photoId: string | null; className?: string }) {
  const { url, resolved } = useBlobUrlResolved(photoId, 'thumb')
  if (url) {
    return <img src={url} alt="" draggable={false} className={cn('h-full w-full object-cover', className)} />
  }
  if (!resolved) return <div className="h-full w-full animate-pulse bg-line/10" />
  return (
    <div className={cn('flex h-full w-full items-center justify-center bg-gradient-to-br from-line/15 to-line/5', className)}>
      <MapPin className="h-[42%] w-[42%] text-faint" strokeWidth={2.2} />
    </div>
  )
}

/** 城市标记：代表性照片缩略图 + 照片数徽标，悬浮显示城市名 */
function CityMarker({ group }: { group: CityGroup }) {
  const count = group.photos.length
  const latestTs = group.photos.reduce((m, p) => Math.max(m, p.takenAt), 0)
  const latestLabel = latestTs ? `${ymd(latestTs).year} 年 ${ymd(latestTs).month} 月` : ''
  return (
    <div className="group relative">
      <div
        className={cn(
          'relative cursor-pointer overflow-hidden rounded-full border border-white/85 shadow-marker ring-1 ring-black/25 transition-transform duration-200 hover:z-20 hover:scale-105 dark:border-white/25 dark:ring-black/50',
          count > 1 ? TIER_MAIN[clusterTier(count)] : 'h-8 w-8'
        )}
      >
        <Thumb photoId={group.coverId} />
      </div>
      {count > 1 && <CountBadge count={count} />}
      {/* 悬浮预览：城市名 + 照片数 + 最近拍摄 */}
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-xl border border-line/10 bg-bg/90 px-3 py-1.5 text-center opacity-0 shadow-float backdrop-blur transition-opacity duration-150 group-hover:opacity-100">
        <p className="text-xs font-semibold text-fg">{group.city}</p>
        <p className="mt-0.5 text-[10px] text-muted">
          {count} 张照片{latestLabel ? ` · 最近 ${latestLabel}` : ''}
        </p>
      </div>
    </div>
  )
}

/** 城市聚合标记：多座城市叠层照片卡片 + 照片总数徽标 */
function ClusterMarker({ covers, count }: { covers: string[]; count: number }) {
  const [main, back1, back2] = covers
  return (
    <div className="relative cursor-pointer transition-transform duration-200 hover:z-20 hover:scale-105">
      {/* 背后两张叠层卡片，营造相册堆叠感 */}
      {back2 && (
        <div className="absolute inset-y-[9%] left-1/2 w-[78%] -translate-x-1/2 rotate-[9deg] overflow-hidden rounded-full border border-white/70 shadow-marker ring-1 ring-black/25 dark:border-white/20">
          <Thumb photoId={back2} />
        </div>
      )}
      {back1 && (
        <div className="absolute inset-y-[6%] left-1/2 w-[86%] -translate-x-1/2 -rotate-[8deg] overflow-hidden rounded-full border border-white/80 shadow-marker ring-1 ring-black/25 dark:border-white/25">
          <Thumb photoId={back1} />
        </div>
      )}
      {/* 主封面 */}
      <div
        className={cn(
          'relative overflow-hidden rounded-full border border-white/85 shadow-marker ring-1 ring-black/25 dark:border-white/25',
          TIER_MAIN[clusterTier(count)]
        )}
      >
        <Thumb photoId={main} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
      </div>
      {/* 照片总数徽标 */}
      <CountBadge count={count} />
    </div>
  )
}

export function MarkersLayer({
  map,
  engine,
  onMarker
}: {
  map: MLMap
  engine: CityEngine
  onMarker: (info: CityMarkerClick) => void
}) {
  const [items, setItems] = useState<RenderItem[]>([])

  useEffect(() => {
    let raf = 0
    const render = () => {
      const bounds = map.getBounds()
      // 经度方向扩展边距放大：Globe 视角下 project 的可见范围跨越反经线
      const span = bounds.getEast() - bounds.getWest()
      const bbox: BBox = [
        bounds.getWest() - Math.max(0.2, span * 0.5),
        Math.max(-85.05, bounds.getSouth() - 0.2),
        bounds.getEast() + Math.max(0.2, span * 0.5),
        Math.min(85.05, bounds.getNorth() + 0.2)
      ]
      const zoom = map.getZoom()
      const center = map.getCenter()
      const features: CityClusterOrPoint[] = engine.clusters(bbox, zoom)
      const next: RenderItem[] = []
      for (const f of features) {
        const [lng, lat] = f.geometry.coordinates
        // 地球背面的城市不显示，避免标记透过球体出现
        if (isBehindGlobe(center, zoom, lat, lng)) continue
        const { x, y } = map.project([lng, lat])
        if (x < -80 || y < -80 || x > window.innerWidth + 80 || y > window.innerHeight + 80) continue
        if (isCityCluster(f)) {
          const cities = engine.groupsOf(f).sort((a, b) => b.photos.length - a.photos.length)
          if (cities.length === 0) continue
          const sum = (f.properties as unknown as { sum?: number }).sum
          const count = sum ?? cities.reduce((n, g) => n + g.photos.length, 0)
          next.push({
            key: `cluster-${f.id}-z${Math.round(zoom)}`,
            x,
            y,
            lng,
            lat,
            count,
            covers: cities.slice(0, 3).map((g) => g.coverId),
            group: null,
            cities,
            clusterId: f.id
          })
        } else {
          const [group] = engine.groupsOf(f)
          if (!group) continue
          next.push({
            key: `city-${group.key}`,
            x,
            y,
            lng,
            lat,
            count: group.photos.length,
            covers: [group.coverId],
            group,
            cities: [group]
          })
        }
      }
      // 下方的标记先渲染，避免遮挡
      next.sort((a, b) => a.y - b.y)
      setItems(next)
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(render)
    }
    render()
    map.on('move', schedule)
    map.on('moveend', render)
    map.on('resize', render)
    return () => {
      cancelAnimationFrame(raf)
      map.off('move', schedule)
      map.off('moveend', render)
      map.off('resize', render)
    }
  }, [map, engine])

  return (
    <div className="marker-layer">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center focus:outline-none"
          style={{ left: item.x, top: item.y, zIndex: Math.round(item.y) }}
          onClick={(e) => {
            e.stopPropagation()
            onMarker({
              kind: item.group ? 'city' : 'cluster',
              group: item.group,
              cities: item.cities,
              lng: item.lng,
              lat: item.lat,
              x: item.x,
              y: item.y,
              clusterId: item.clusterId
            })
          }}
          aria-label={
            item.group
              ? `${item.group.city} · ${item.count} 张照片`
              : `${item.cities.length} 座城市 · ${item.count} 张照片`
          }
        >
          {item.group ? (
            <CityMarker group={item.group} />
          ) : (
            <ClusterMarker covers={item.covers} count={item.count} />
          )}
        </button>
      ))}
    </div>
  )
}
