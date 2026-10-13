// 地理聚合：对 Supercluster 的薄封装，以及统计用的“拍摄地点”计算
import Supercluster from 'supercluster'
import type { BBox } from 'geojson'
import type { Photo } from '@/types'

export interface PhotoPointProps {
  photoId: string
}

type LocatedPhoto = Photo & { lat: number; lng: number }

/** 类型守卫：坐标完整的照片 */
export function isLocated(p: Photo): p is LocatedPhoto {
  return p.lat !== null && p.lng !== null
}

export type PointFeature = Supercluster.PointFeature<PhotoPointProps>
export type ClusterFeature = Supercluster.ClusterFeature<Record<string, never>> & { id: number }

export type ClusterOrPoint = PointFeature | ClusterFeature

export interface Bounds {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

export function boundsOf(photos: Array<Pick<Photo, 'lat' | 'lng'>>): Bounds | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  let n = 0
  for (const p of photos) {
    if (p.lat === null || p.lng === null) continue
    n++
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
  }
  return n ? { minLng, minLat, maxLng, maxLat } : null
}

export function padBounds(b: Bounds, ratio = 0.18): Bounds {
  const lngPad = Math.max((b.maxLng - b.minLng) * ratio, 0.01)
  const latPad = Math.max((b.maxLat - b.minLat) * ratio, 0.01)
  return {
    minLng: Math.max(-180, b.minLng - lngPad),
    maxLng: Math.min(180, b.maxLng + lngPad),
    minLat: Math.max(-85, b.minLat - latPad),
    maxLat: Math.min(85, b.maxLat + latPad)
  }
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Globe 视角遮挡判断：低倍缩放（球体可见）时，与视野中心大圆距离超过 90°
 * 的位置位于地球背面，标记不应显示。zoom ≥ 6 后地图已过渡为平面，无需判断。
 */
export function isBehindGlobe(
  center: { lat: number; lng: number },
  zoom: number,
  lat: number,
  lng: number
): boolean {
  if (zoom >= 6) return false
  // 90° 大圆弧长 ≈ (π/2) × 6371 ≈ 10007 km，取略小值留出边缘淡出余量
  return haversineKm(center, { lat, lng }) > 9900
}

export class ClusterEngine {
  private index: Supercluster<PhotoPointProps, Record<string, never>>

  constructor(photos: Photo[], options?: { radius?: number; maxZoom?: number; minPoints?: number }) {
    this.index = new Supercluster<PhotoPointProps, Record<string, never>>({
      radius: options?.radius ?? 50,
      maxZoom: options?.maxZoom ?? 16,
      minPoints: options?.minPoints ?? 2,
      extent: 256,
      nodeSize: 64
    })
    this.index.load(
      photos
        .filter(isLocated)
        .map((p) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
          properties: { photoId: p.id }
        }))
    )
  }

  clusters(bbox: BBox, zoom: number): ClusterOrPoint[] {
    return this.index.getClusters(bbox, Math.round(zoom)) as ClusterOrPoint[]
  }

  expansionZoom(clusterId: number): number {
    try {
      return this.index.getClusterExpansionZoom(clusterId)
    } catch {
      return 20
    }
  }

  photoIdsOf(item: ClusterOrPoint): string[] {
    if (isCluster(item)) {
      const leaves = this.index.getLeaves(item.id, Infinity)
      return leaves.map((l) => (l.properties as unknown as PhotoPointProps).photoId)
    }
    return [item.properties.photoId]
  }
}

export function isCluster(item: ClusterOrPoint): item is ClusterFeature {
  return (item.properties as Supercluster.ClusterProperties).cluster === true
}

/** 统计口径：zoom 14、约 50px 半径内的拍摄点视为同一个“拍摄地点” */
export function countDistinctSpots(photos: Photo[]): number {
  const located = photos.filter(isLocated)
  if (located.length === 0) return 0
  const engine = new ClusterEngine(located, { radius: 50, maxZoom: 14 })
  return engine.clusters([-180, -85, 180, 85], 14).length
}
