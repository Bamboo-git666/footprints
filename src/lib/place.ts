import { haversineKm } from './geo'
import { getMeta, setMeta } from './db'
import type { Photo } from '@/types'

/** 一组照片最具代表性的地点名 */
export function placeDisplayName(photos: Photo[]): string {
  const counts = new Map<string, number>()
  for (const p of photos) {
    const name = p.placeName || p.city
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [name, n] of counts) {
    if (n > bestN) {
      best = name
      bestN = n
    }
  }
  if (best) return best
  const country = photos.find((p) => p.country)?.country
  return country ?? '未命名地点'
}

export function placeSubtitle(photos: Photo[]): string {
  const city = photos.find((p) => p.city)?.city
  const country = photos.find((p) => p.country)?.country
  return [city, country].filter(Boolean).join(' · ')
}

/** 选封面：优先离焦点最近的，否则时间最早的第一张 */
export function pickCover(photos: Photo[], focus?: { lat: number; lng: number } | null): Photo {
  if (photos.length === 0) throw new Error('空照片集')
  if (!focus) return [...photos].sort((a, b) => a.takenAt - b.takenAt)[0]
  let best = photos[0]
  let bestD = Infinity
  for (const p of photos) {
    if (p.lat === null || p.lng === null) continue
    const d = haversineKm({ lat: p.lat, lng: p.lng }, focus)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

// ---- 地点级个人备注（存 meta 表，按坐标中心点 ~1km 聚合键，无 schema 变更）----

const PLACE_NOTE_KEY = 'placeNotes'

type PlaceNoteMap = Record<string, string>

/** 稳定的地点键：中心点坐标四舍五入到 0.01 度（约 1km），同一地点多次打开键一致 */
export function placeKeyOf(photos: Photo[]): string | null {
  let lat = 0
  let lng = 0
  let n = 0
  for (const p of photos) {
    if (p.lat === null || p.lng === null) continue
    lat += p.lat
    lng += p.lng
    n++
  }
  if (n === 0) return null
  return `${(lat / n).toFixed(2)},${(lng / n).toFixed(2)}`
}

export async function getPlaceNote(key: string): Promise<string> {
  const map = await getMeta<PlaceNoteMap>(PLACE_NOTE_KEY, {})
  return map[key] ?? ''
}

export async function setPlaceNote(key: string, note: string): Promise<void> {
  const map = await getMeta<PlaceNoteMap>(PLACE_NOTE_KEY, {})
  if (note.trim()) map[key] = note.trim()
  else delete map[key]
  await setMeta(PLACE_NOTE_KEY, map)
}

// ---- 城市日记（存 meta 表，按城市「国家|省|市」三元组键，无 schema 变更）----

export interface CityDiary {
  content: string
  updatedAt: number
}

const CITY_DIARY_KEY = 'cityDiaries'

export async function getCityDiary(cityKey: string): Promise<CityDiary | null> {
  const map = await getMeta<Record<string, CityDiary>>(CITY_DIARY_KEY, {})
  return map[cityKey] ?? null
}

/** content 为空时删除该城市日记 */
export async function setCityDiary(cityKey: string, content: string): Promise<void> {
  const map = await getMeta<Record<string, CityDiary>>(CITY_DIARY_KEY, {})
  if (content.trim()) map[cityKey] = { content: content.trim(), updatedAt: Date.now() }
  else delete map[cityKey]
  await setMeta(CITY_DIARY_KEY, map)
}

/** 备份导出用：全部城市日记 */
export async function getAllCityDiaries(): Promise<Record<string, CityDiary>> {
  return getMeta<Record<string, CityDiary>>(CITY_DIARY_KEY, {})
}
