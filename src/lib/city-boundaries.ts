import type { FeatureCollection } from 'geojson'
import { CITY_ADCODES, DISTRICT_ADCODES } from './city-adcodes'

/**
 * 城市行政区划边界：把照片归属的城市名映射到 DataV 行政区划编码，
 * 按需拉取该城市的边界 GeoJSON 用于在地图上点亮城市区域。
 * 边界数据来自阿里云 DataV GeoJSON 服务（公开免费），仅在内存中缓存。
 */

const FULL = new Map(Object.entries(CITY_ADCODES))
// 短名索引：去掉「特别行政区 / 自治州 / 地区 / 盟 / 市」后缀（如 香港 → 香港特别行政区）
const SHORT = new Map<string, number>()
for (const [name, ad] of FULL) {
  const s = name.replace(/(特别行政区|自治州|地区|盟|市)$/, '')
  if (!SHORT.has(s)) SHORT.set(s, ad)
}
// 区县名 → [地级市编码, 省名][]（同名区县可能有多个归属）
const DISTRICT = new Map(Object.entries(DISTRICT_ADCODES))

/**
 * 城市名 → 行政区划编码。宽松匹配：标准市名、短名、区县级名（如「南山区」→ 深圳市）均可。
 * 同名区县优先按省名消歧，消歧失败取列表第一个（宽松点亮，宁可不错过）。
 * 境外城市 / 无法识别的名字返回 null。
 */
export function adcodeOf(cityName: string, region?: string | null): number | null {
  const n = cityName.trim()
  if (!n) return null
  const direct = FULL.get(n) ?? SHORT.get(n) ?? SHORT.get(n.replace(/市$/, ''))
  if (direct) return direct
  const list = DISTRICT.get(n)
  if (!list) return null
  if (list.length > 1 && region) {
    const hit = list.find(([, prov]) => prov === region.trim())
    if (hit) return hit[0]
  }
  return list[0][0]
}

const boundaryUrl = (ad: number) => `https://geo.datav.aliyun.com/areas_v3/bound/${ad}.json`

/** 拉取城市边界，统一返回 FeatureCollection（DataV 部分编码直接返回单个 Feature） */
export async function fetchCityBoundary(ad: number): Promise<FeatureCollection> {
  const res = await fetch(boundaryUrl(ad))
  if (!res.ok) throw new Error(`城市边界加载失败 ${ad}: HTTP ${res.status}`)
  const json = (await res.json()) as FeatureCollection | { type: string; features: unknown[] }
  if (json.type === 'FeatureCollection') return json as FeatureCollection
  return { type: 'FeatureCollection', features: [json as never] }
}

// 进程内缓存：一次会话内同一城市只拉取一次
const cache = new Map<number, FeatureCollection>()

/** 加载城市边界（带会话内缓存）；失败时仅告警并返回 null，不影响地图其他功能 */
export async function loadCityBoundary(ad: number): Promise<FeatureCollection | null> {
  const hit = cache.get(ad)
  if (hit) return hit
  try {
    const fc = await fetchCityBoundary(ad)
    cache.set(ad, fc)
    return fc
  } catch (err) {
    console.warn('[footprints] 城市边界加载失败（不影响其他功能）:', ad, err)
    return null
  }
}

// ---- 满天星：在城市边界内随机撒星点 ----

/** 射线法：点是否在环内 */
function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 点是否落在任意多边形内（含洞处理） */
function pointInPolygons(x: number, y: number, polys: number[][][][]): boolean {
  for (const rings of polys) {
    if (pointInRing(x, y, rings[0])) {
      let inHole = false
      for (let i = 1; i < rings.length; i++) {
        if (pointInRing(x, y, rings[i])) {
          inHole = true
          break
        }
      }
      if (!inHole) return true
    }
  }
  return false
}

/**
 * 在边界 FeatureCollection 覆盖的区域内随机撒点。
 * 返回 Point Feature 列表，properties.g 用于闪烁分组、r 为星点半径系数。
 */
export function scatterStarPoints(
  fc: FeatureCollection,
  count: number,
  groups: number
): { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { g: number; r: number } }[] {
  const polys: number[][][][] = []
  let minX = 180
  let minY = 90
  let maxX = -180
  let maxY = -90
  const scan = (ring: number[][]) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  for (const f of fc.features) {
    const g = f.geometry
    if (g.type === 'Polygon') {
      polys.push(g.coordinates)
      g.coordinates.forEach(scan)
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) {
        polys.push(poly)
        poly.forEach(scan)
      }
    }
  }
  if (polys.length === 0) return []

  const out: { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { g: number; r: number } }[] = []
  let attempts = 0
  const maxAttempts = count * 40
  while (out.length < count && attempts < maxAttempts) {
    attempts++
    const x = minX + Math.random() * (maxX - minX)
    const y = minY + Math.random() * (maxY - minY)
    if (!pointInPolygons(x, y, polys)) continue
    out.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [x, y] },
      properties: { g: out.length % groups, r: 0.9 + Math.random() * 1.6 }
    })
  }
  return out
}
