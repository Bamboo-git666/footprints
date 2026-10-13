// 智能旅行推荐：基于拍摄时间连续性 + 地理位置跨度划分候选旅行段
// 原则：只做建议，用户确认后才真正创建；无法判断的照片保持未归档。
import { haversineKm } from './geo'
import type { Photo } from '@/types'

export interface JourneySuggestion {
  /** 稳定 id：首末照片 id 组合（同一数据集划分结果一致） */
  id: string
  name: string
  startDate: number
  endDate: number
  photoIds: string[]
  /** 段内出现过的城市（去重，按首次拍摄顺序） */
  cities: string[]
  countries: string[]
  coverPhotoId: string | null
  /** 段内照片地理跨度（km），多城市旅行会更大 */
  spanKm: number
}

const GAP_MS = 3 * 86400000 // 相邻照片间隔超过 3 天视为不同旅程
const MAX_SPAN_MS = 45 * 86400000 // 单段最大时间跨度，超过则按 14 天窗口细分
const SUB_GAP_MS = 14 * 86400000
const MIN_PHOTOS = 3 // 少于 3 张不做建议（信息不足，保持未归档）

function citiesOf(photos: Photo[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of photos) {
    const c = p.city
    if (c && !seen.has(c)) {
      seen.add(c)
      out.push(c)
    }
  }
  return out
}

function countriesOf(photos: Photo[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of photos) {
    const c = p.country
    if (c && !seen.has(c)) {
      seen.add(c)
      out.push(c)
    }
  }
  return out
}

function spanKmOf(photos: Photo[]): number {
  let max = 0
  const located = photos.filter((p) => p.lat !== null && p.lng !== null)
  for (let i = 0; i < located.length; i++) {
    for (let j = i + 1; j < located.length; j++) {
      const d = haversineKm(
        { lat: located[i].lat!, lng: located[i].lng! },
        { lat: located[j].lat!, lng: located[j].lng! }
      )
      if (d > max) max = d
    }
  }
  return max
}

function suggestName(startDate: number, cities: string[]): string {
  const y = new Date(startDate).getFullYear()
  if (cities.length === 0) return `${y} 之旅`
  if (cities.length === 1) return `${y} ${cities[0]}之旅`
  return `${y} ${cities.slice(0, 2).join(' · ')}之旅`
}

/** 按时间间隔分段（可递归细分超长段） */
function segmentByGap(sorted: Photo[], gapMs: number): Photo[][] {
  const segments: Photo[][] = []
  let cur: Photo[] = []
  for (const p of sorted) {
    if (cur.length && p.takenAt - cur[cur.length - 1].takenAt > gapMs) {
      segments.push(cur)
      cur = []
    }
    cur.push(p)
  }
  if (cur.length) segments.push(cur)
  return segments
}

/**
 * 生成旅行建议：
 * 1. 仅取已定位且未归档（journeyId 为空）的照片
 * 2. 按 3 天间隔切段——同一次旅行几乎不会连续 3 天零拍摄
 * 3. 超 45 天的长段按 14 天再细分（数字游民式连续拍摄不会误并数月行程）
 * 4. 少于 3 张的段保持未归档（证据不足）
 */
export function suggestJourneys(photos: Photo[]): JourneySuggestion[] {
  const pool = photos
    .filter((p) => p.lat !== null && p.lng !== null && p.journeyId === null)
    .sort((a, b) => a.takenAt - b.takenAt)
  if (pool.length < MIN_PHOTOS) return []

  let segments = segmentByGap(pool, GAP_MS)
  // 细分超长段
  segments = segments.flatMap((seg) => {
    if (seg[seg.length - 1].takenAt - seg[0].takenAt <= MAX_SPAN_MS) return [seg]
    return segmentByGap(seg, SUB_GAP_MS).filter((s) => s.length > 0)
  })

  const out: JourneySuggestion[] = []
  for (const seg of segments) {
    if (seg.length < MIN_PHOTOS) continue
    const cities = citiesOf(seg)
    const countries = countriesOf(seg)
    out.push({
      id: `${seg[0].id}:${seg[seg.length - 1].id}`,
      name: suggestName(seg[0].takenAt, cities),
      startDate: seg[0].takenAt,
      endDate: seg[seg.length - 1].takenAt,
      photoIds: seg.map((p) => p.id),
      cities,
      countries,
      coverPhotoId: null,
      spanKm: spanKmOf(seg)
    })
  }
  // 最近的可能最相关，排前面
  return out.sort((a, b) => b.startDate - a.startDate)
}
