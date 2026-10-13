// 城市级照片归档：地图上的照片展示与归组单位
// - 每张照片保留原始 GPS，仅将地图归组粒度提升为「城市」（地级市 / 直辖市 / 境外等效行政单位）
// - 城市键使用 国家代码 + 一级行政区 + 城市名 的行政区划组合，
//   避免不同国家 / 地区名称相同的城市被错误合并；不做任何按半径的猜测式归并
// - 城市判定来自逆地理编码（Nominatim）或用户手动指定，无法判定的照片不进入城市标记
import Supercluster from 'supercluster'
import type { BBox } from 'geojson'
import { isLocated } from './geo'
import type { Photo } from '@/types'

export interface CityGroup {
  /** 稳定城市键（countryCode|region|city） */
  key: string
  city: string
  region: string | null
  country: string | null
  countryCode: string | null
  /** 该城市全部照片（按拍摄时间升序） */
  photos: Photo[]
  /** 代表坐标：成员照片平均位置 */
  lng: number
  lat: number
  /** 代表封面：最新一张照片 */
  coverId: string
}

/** 稳定城市键：避免仅凭城市名字符串跨国家 / 跨地区合并 */
export function cityKeyOf(p: Pick<Photo, 'city' | 'region' | 'countryCode'>): string | null {
  if (!p.city) return null
  return `${p.countryCode ?? ''}|${p.region ?? ''}|${p.city}`
}

/** 将照片按城市归组；已定位且能判定城市的照片才会出现在结果中 */
export function buildCityGroups(photos: Photo[]): CityGroup[] {
  const map = new Map<string, Photo[]>()
  for (const p of photos) {
    if (!isLocated(p)) continue
    const key = cityKeyOf(p)
    if (!key) continue
    const arr = map.get(key)
    if (arr) arr.push(p)
    else map.set(key, [p])
  }

  const groups: CityGroup[] = []
  for (const [key, list] of map) {
    list.sort((a, b) => a.takenAt - b.takenAt)
    let lat = 0
    let lng = 0
    for (const p of list) {
      lat += p.lat as number
      lng += p.lng as number
    }
    lat /= list.length
    lng /= list.length
    const first = list[0]
    groups.push({
      key,
      city: first.city as string,
      region: first.region ?? null,
      country: first.country ?? null,
      countryCode: first.countryCode ?? null,
      photos: list,
      lng,
      lat,
      coverId: list[list.length - 1].id
    })
  }
  return groups.sort((a, b) => b.photos.length - a.photos.length)
}

export function cityTitle(g: Pick<CityGroup, 'city' | 'region' | 'country'>): string {
  return [g.region, g.country].filter(Boolean).join(' · ')
}

// ---- 城市聚合引擎：以「城市」为点参与 Supercluster 聚合 ----

export interface CityPointProps {
  groupKey: string
  /** 聚合权重：城市内照片数，聚合簇上汇总为总照片数 */
  photoCount: number
}

export type CityClusterOrPoint =
  | Supercluster.PointFeature<CityPointProps>
  | (Supercluster.ClusterFeature<{ sum: number }> & { id: number })

export function isCityCluster(item: CityClusterOrPoint): item is Supercluster.ClusterFeature<{ sum: number }> & { id: number } {
  return (item.properties as Supercluster.ClusterProperties).cluster === true
}

export class CityEngine {
  private index: Supercluster<CityPointProps, { sum: number }>
  private groupMap: Map<string, CityGroup>

  constructor(groups: CityGroup[]) {
    this.groupMap = new Map(groups.map((g) => [g.key, g]))
    this.index = new Supercluster<CityPointProps, { sum: number }>({
      // 聚合半径略大于照片引擎：城市点更稀疏，适度聚合避免全球视角拥挤
      radius: 56,
      maxZoom: 16,
      minPoints: 2,
      extent: 256,
      nodeSize: 64,
      // 聚合簇上汇总照片总数（徽标语义：张照片），point_count 仅表示城市数量
      map: (props) => ({ sum: props.photoCount }),
      reduce: (acc, props) => {
        acc.sum += props.sum
      }
    })
    this.index.load(
      groups.map((g) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [g.lng, g.lat] },
        properties: { groupKey: g.key, photoCount: g.photos.length }
      }))
    )
  }

  clusters(bbox: BBox, zoom: number): CityClusterOrPoint[] {
    return this.index.getClusters(bbox, Math.round(zoom)) as CityClusterOrPoint[]
  }

  expansionZoom(clusterId: number): number {
    try {
      return this.index.getClusterExpansionZoom(clusterId)
    } catch {
      return 18
    }
  }

  /** 聚合点 / 单点包含的城市组（单点返回一个） */
  groupsOf(item: CityClusterOrPoint): CityGroup[] {
    if (isCityCluster(item)) {
      const leaves = this.index.getLeaves(item.id, Infinity)
      const groups: CityGroup[] = []
      for (const l of leaves) {
        const g = this.groupMap.get((l.properties as unknown as CityPointProps).groupKey)
        if (g) groups.push(g)
      }
      return groups
    }
    const g = this.groupMap.get(item.properties.groupKey)
    return g ? [g] : []
  }
}
