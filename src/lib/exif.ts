// EXIF 解析（防御式：任何失败都不应阻止照片导入）
// 关键原则：没有 GPS 就返回 null，绝不根据文件名 / 时间猜测地点。
import ExifReader from 'exifreader'

export interface ExifResult {
  lat: number | null
  lng: number | null
  takenAt: number | null
  camera: string | null
  lens: string | null
  focalLength: number | null
  fNumber: number | null
  iso: number | null
  exposureTime: string | null
}

type RationalTag = {
  value: [number, number]
  computed?: number | null
  description?: string
}
type NumberTag = { value: number | number[]; description?: string }
type StringTag = { value?: string | string[]; description?: string }

function rational(tag: RationalTag | undefined): number | null {
  if (!tag) return null
  if (typeof tag.computed === 'number' && Number.isFinite(tag.computed)) return tag.computed
  const [n, d] = tag.value ?? []
  if (typeof n === 'number' && typeof d === 'number' && d !== 0) return n / d
  return null
}

function integer(tag: NumberTag | undefined): number | null {
  if (!tag) return null
  const v = Array.isArray(tag.value) ? tag.value[0] : tag.value
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function text(tag: StringTag | undefined): string | null {
  const s = tag?.description?.trim()
  return s ? s : null
}

/** 解析 "2024:06:20 20:12:06"（可能含时区后缀） */
function parseExifDate(s: string | null): number | null {
  if (!s) return null
  const m = s.match(/(\d{4})[:/-](\d{2})[:/-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se ?? 0))
  const t = date.getTime()
  return Number.isFinite(t) ? t : null
}

export function parseExif(buffer: ArrayBuffer): ExifResult {
  const empty: ExifResult = {
    lat: null, lng: null, takenAt: null, camera: null, lens: null,
    focalLength: null, fNumber: null, iso: null, exposureTime: null
  }
  let tags
  try {
    tags = ExifReader.load(buffer, { expanded: true })
  } catch {
    return empty
  }
  if (!tags || typeof tags !== 'object') return empty

  let lat = tags.gps?.Latitude ?? null
  let lng = tags.gps?.Longitude ?? null
  if (lat !== null && (lat < -90 || lat > 90)) lat = null
  if (lng !== null && (lng < -180 || lng > 180)) lng = null

  const exif = tags.exif
  const takenAt = parseExifDate(
    text(exif?.DateTimeOriginal as StringTag | undefined) ??
      text(exif?.DateTimeDigitized as StringTag | undefined) ??
      text(exif?.DateTime as StringTag | undefined)
  )

  const make = text(exif?.Make as StringTag | undefined)
  const model = text(exif?.Model as StringTag | undefined)
  let camera: string | null = null
  if (make && model) camera = model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`
  else camera = model ?? make

  return {
    lat,
    lng,
    takenAt,
    camera,
    lens: text(exif?.LensModel as StringTag | undefined) ?? text(exif?.LensMake as StringTag | undefined),
    focalLength: rational(exif?.FocalLength as RationalTag | undefined),
    fNumber: rational(exif?.FNumber as RationalTag | undefined),
    iso: integer(exif?.ISOSpeedRatings as NumberTag | undefined),
    exposureTime: text(exif?.ExposureTime as StringTag | undefined)
  }
}
