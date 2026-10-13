// 地理编码：Nominatim（OpenStreetMap）
// - 个人低频使用，严格串行且请求间隔 ≥ 1.1s，遵守使用政策
// - 全部为网络尽力而为：失败返回 null，绝不编造城市 / 国家
// - 本地缓存，重复坐标不重复请求

const BASE = 'https://nominatim.openstreetmap.org'
const LANG = 'zh-CN'

export interface GeoSearchResult {
  lat: number
  lng: number
  label: string
  detail: string
}

export interface ReverseResult {
  placeName: string
  city: string | null
  region: string | null
  country: string | null
  countryCode: string | null
}

// 串行队列：保证对同一类接口的请求间隔；已被取消的排队请求立即跳过、不占用间隔
function makeQueue(gapMs: number) {
  let tail: Promise<void> = Promise.resolve()
  return <T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
    const run = tail.then(() => (signal?.aborted ? (undefined as T) : fn()))
    tail = run.then(
      () => new Promise<void>((r) => setTimeout(r, signal?.aborted ? 0 : gapMs)),
      () => new Promise<void>((r) => setTimeout(r, gapMs))
    )
    return run
  }
}
const reverseQueue = makeQueue(1100)
const searchQueue = makeQueue(1000)

interface NominatimAddress {
  country?: string
  country_code?: string
  state?: string
  region?: string
  city?: string
  town?: string
  village?: string
  hamlet?: string
  suburb?: string
  district?: string
  county?: string
  road?: string
  pedestrian?: string
  neighbourhood?: string
}

interface NominatimJson {
  lat: string
  lon: string
  display_name: string
  name?: string
  address?: NominatimAddress
}

/**
 * 中国城市层级提升：OSM 数据中部分市辖区（如深圳的南山区 / 罗湖区）被标注为 city，
 * 直接采用会把同一地级市拆成多个「城市」。
 * display_name 保留完整行政链（如「…, 南山区, 深圳市, 广东省, …」），
 * 对中国结果解析其中第一个「X市」段（地级市 / 直辖市 / 县级市）作为城市归属。
 * 找不到「市」段时返回 null，调用方保留原有字段，不做任何猜测。
 */
function promoteCnCity(countryCode: string | null, displayName: string): string | null {
  if (countryCode !== 'CN') return null
  for (const seg of displayName.split(',')) {
    const s = seg.trim()
    if (s.length >= 3 && s.endsWith('市')) return s
  }
  return null
}

function normalizeReverse(json: NominatimJson): ReverseResult {
  const a = json.address ?? {}
  const country = a.country || null
  const countryCode = a.country_code ? a.country_code.toUpperCase() : null
  const promoted = promoteCnCity(countryCode, json.display_name ?? '')
  const city = promoted ?? (a.city || a.town || a.village || a.hamlet || a.suburb || a.county || null)
  const region = a.state || a.region || null
  const streetPart = a.road || a.pedestrian || a.neighbourhood
  const placeName =
    [streetPart, city, country].filter(Boolean).slice(0, streetPart ? 3 : 2).join('，') ||
    json.display_name
  return { placeName, city, region, country, countryCode }
}

const reverseCache = new Map<string, ReverseResult | null>()

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
  opts?: { force?: boolean }
): Promise<ReverseResult | null> {
  const key = cacheKey(lat, lng)
  // force：绕过缓存重新请求（用于行政区划规则升级后的存量迁移与手动重试），结果会覆盖缓存
  if (!opts?.force && reverseCache.has(key)) {
    return reverseCache.get(key) ?? null
  }
  return reverseQueue(async () => {
    try {
      const url = `${BASE}/reverse?format=jsonv2&addressdetails=1&zoom=16&accept-language=${LANG}&lat=${lat.toFixed(7)}&lon=${lng.toFixed(7)}`
      const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as NominatimJson & { error?: string }
      if (json.error || !json.display_name) {
        reverseCache.set(key, null)
        return null
      }
      const result = normalizeReverse(json)
      reverseCache.set(key, result)
      return result
    } catch {
      return null
    }
  })
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoSearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  return searchQueue(async () => {
    try {
      const url = `${BASE}/search?format=jsonv2&addressdetails=1&limit=8&accept-language=${LANG}&q=${encodeURIComponent(q)}`
      const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const arr = (await res.json()) as NominatimJson[]
      return arr
        .map((j) => {
          const parts = j.display_name.split(', ')
          const label = parts[0] || j.display_name
          const detail = parts.slice(1).join(', ')
          return {
            lat: Number(j.lat),
            lng: Number(j.lon),
            label: j.name || label,
            detail
          }
        })
        .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
    } catch {
      return []
    }
  })
}
