// 照片导入编排：读取 → 哈希去重 → EXIF → HEIC 转换 → 缩略图 → IndexedDB
// EXIF 解析失败 / 无 GPS 都不会阻止导入；无 GPS 照片进入“待定位”。
import { db } from './db'
import { parseExif } from './exif'
import { convertHeic, generateDerived, isSupportedImage, readArrayBuffer, sha256Hex } from './image'
import { reverseGeocode } from './geocoder'
import { uid } from './utils'
import type { Photo } from '@/types'

export interface ImportProgressState {
  running: boolean
  total: number
  processed: number
  added: number
  duplicates: number
  unsupported: number
  failed: number
  located: number
  pending: number
  currentName: string
  heicHint: boolean
  errors: { name: string; reason: string }[]
}

const initial: ImportProgressState = {
  running: false, total: 0, processed: 0, added: 0, duplicates: 0, unsupported: 0,
  failed: 0, located: 0, pending: 0, currentName: '', heicHint: false, errors: []
}

let state: ImportProgressState = { ...initial }
const listeners = new Set<() => void>()

export function getImportState(): ImportProgressState {
  return state
}

export function subscribeImport(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function setState(patch: Partial<ImportProgressState>) {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22)
}

async function buildPhoto(file: File, hash: string, buffer: ArrayBuffer): Promise<{ photo: Photo; imageBlob: Blob }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const isHeic = ext === 'heic' || ext === 'heif'

  // HEIC：先从原件解析 EXIF（转换后的 JPEG 通常丢失 EXIF），再转码
  const exif = parseExif(buffer)
  let imageBlob: Blob = file
  if (isHeic) {
    imageBlob = await convertHeic(file)
  }

  const derived = await generateDerived(imageBlob)
  const now = Date.now()
  const lat = exif.lat
  const lng = exif.lng

  const photo: Photo = {
    id: uid(),
    hash,
    fileName: file.name,
    fileType: isHeic ? 'image/jpeg（由 HEIC 转换）' : file.type || `image/${ext}`,
    size: file.size,
    width: derived.width,
    height: derived.height,
    takenAt: exif.takenAt ?? (file.lastModified || now),
    importedAt: now,
    lat,
    lng,
    locationStatus: lat !== null && lng !== null ? 'located' : 'pending',
    placeName: null,
    city: null,
    region: null,
    country: null,
    countryCode: null,
    geocodedAt: null,
    name: null,
    note: null,
    camera: exif.camera,
    lens: exif.lens,
    focalLength: exif.focalLength,
    fNumber: exif.fNumber,
    iso: exif.iso,
    exposureTime: exif.exposureTime,
    journeyId: null
  }

  // 二进制单独保存，保证元数据查询轻量
  await db.transaction('rw', db.photos, db.blobs, async () => {
    await db.photos.add(photo)
    await db.blobs.add({ id: photo.id, original: file, medium: derived.medium, thumb: derived.thumb })
  })
  return { photo, imageBlob }
}

/** 异步补全逆地理信息；失败静默（用户仍可手动指定 / 稍后重试） */
async function enrichPhoto(photoId: string) {
  try {
    const p = await db.photos.get(photoId)
    if (!p || p.lat === null || p.lng === null || p.geocodedAt) return
    const geo = await reverseGeocode(p.lat, p.lng)
    if (!geo) return
    // 再次确认记录仍在且坐标未被用户改动
    const cur = await db.photos.get(photoId)
    if (!cur || cur.geocodedAt || cur.lat !== p.lat || cur.lng !== p.lng) return
    await db.photos.update(photoId, {
      placeName: geo.placeName,
      city: geo.city,
      region: geo.region,
      country: geo.country,
      countryCode: geo.countryCode,
      geocodedAt: Date.now()
    })
  } catch {
    /* 网络失败不影响使用 */
  }
}

/** 启动 / 应用启动时补偿：把已定位但缺少地名的照片补全（串行，受地理编码队列限速） */
export async function drainPendingEnrichment(limit = 300): Promise<void> {
  const rows = await db.photos
    .filter((p) => p.geocodedAt === null && p.lat !== null && p.lng !== null)
    .limit(limit)
    .toArray()
  for (const p of rows) {
    await enrichPhoto(p.id)
  }
}

/**
 * 城市归属补偿：已定位但缺少城市字段的照片（历史失败 / 服务暂不可用）重试逆地理。
 * 每次启动限量执行，失败仍保持无城市状态，进入「待确认城市」由用户手动指定。
 */
export async function drainMissingCities(limit = 60): Promise<void> {
  const rows = await db.photos
    .filter((p) => p.lat !== null && p.lng !== null && !p.city)
    .limit(limit)
    .toArray()
  for (const p of rows) {
    if (p.lat === null || p.lng === null) continue
    const geo = await reverseGeocode(p.lat, p.lng, undefined, { force: true })
    if (!geo?.city) continue
    const cur = await db.photos.get(p.id)
    if (!cur || cur.city || cur.lat !== p.lat || cur.lng !== p.lng) continue
    await db.photos.update(p.id, {
      city: geo.city,
      region: geo.region,
      country: geo.country,
      countryCode: geo.countryCode,
      // placeName 已有值则保留（街道级地名更精确），缺失时一并补全
      placeName: cur.placeName ?? geo.placeName,
      geocodedAt: Date.now()
    })
  }
}

/**
 * 城市归属迁移：中国境内被 OSM 标注为区/乡镇级（如「南山区」「鲁朗镇」）的照片，
 * 按 display_name 行政链提升为地级市（深圳市）。仅处理 city 不以「市」结尾的中国照片；
 * 境外与其他未识别结果保持原状。
 * 页面打开期间持续分批重试直到全部完成；某轮整批零成功即视为服务暂不可用，
 * 停止本轮迁移等待下次启动或设置页手动触发，避免无限请求。返回本轮修复张数。
 */
export async function migrateCnCityGroups(limit = 90): Promise<number> {
  let totalFixed = 0
  for (let round = 0; round < 60; round++) {
    const rows = await db.photos
      .filter(
        (p) =>
          p.countryCode === 'CN' &&
          !!p.city &&
          // 两类需要校准：区/乡镇级名称；或手动指定导致 region 缺失的照片
          (!p.city.endsWith('市') || p.region === null) &&
          p.lat !== null &&
          p.lng !== null
      )
      .limit(limit)
      .toArray()
    // 全部归档完成
    if (rows.length === 0) return totalFixed
    let fixed = 0
    for (const p of rows) {
      if (p.lat === null || p.lng === null) continue
      const geo = await reverseGeocode(p.lat, p.lng, undefined, { force: true })
      const cur = await db.photos.get(p.id)
      if (!cur || cur.lat !== p.lat || cur.lng !== p.lng) continue
      // 已是「X市 + 有省份」的完成态跳过；手动指定（region 为 null）的仍需补全省份
      if (cur.city?.endsWith('市') && cur.region !== null) continue
      if (!geo?.city) continue
      const cityChanged = geo.city !== cur.city
      const regionFilled = cur.region === null && geo.region != null
      // city 提升或 region 补全至少发生其一才写入，不做任何猜测
      if (!cityChanged && !regionFilled) continue
      await db.photos.update(p.id, {
        city: geo.city,
        region: geo.region ?? cur.region,
        country: geo.country ?? cur.country,
        countryCode: geo.countryCode ?? cur.countryCode,
        geocodedAt: Date.now()
      })
      fixed++
    }
    totalFixed += fixed
    // 本轮整批零成功 → 地理服务当前不可用，停止后台迁移（数据保持原状，不会丢失）
    if (fixed === 0) return totalFixed
  }
  return totalFixed
}

export async function importFiles(files: File[]): Promise<void> {
  if (state.running) return
  const supported = files.filter(isSupportedImage)
  const unsupportedCount = files.length - supported.length
  if (supported.length === 0) {
    setState({ ...initial, unsupported: unsupportedCount, errors: unsupportedCount ? [{ name: '本次选择', reason: '未发现 JPG / JPEG / PNG / WebP / HEIC 文件（如 DNG 请先导出为 JPEG）' }] : [] })
    return
  }

  const hasHeic = supported.some((f) => /\.(heic|heif)$/i.test(f.name))
  setState({
    ...initial,
    running: true,
    total: supported.length,
    unsupported: unsupportedCount,
    currentName: '准备导入…',
    heicHint: hasHeic
  })

  const existingHashes = new Set((await db.photos.orderBy('hash').keys()) as string[])
  const batchHashes = new Set<string>()
  const enrichIds: string[] = []

  for (let i = 0; i < supported.length; i++) {
    const file = supported[i]
    setState({ processed: i, currentName: file.name })
    try {
      const buffer = await readArrayBuffer(file)
      const hash = await sha256Hex(buffer)
      if (existingHashes.has(hash) || batchHashes.has(hash)) {
        setState({ duplicates: state.duplicates + 1 })
        continue
      }
      batchHashes.add(hash)

      const { photo } = await buildPhoto(file, hash, buffer)
      existingHashes.add(hash)
      enrichIds.push(photo.id)
      setState({
        added: state.added + 1,
        located: state.located + (photo.locationStatus === 'located' ? 1 : 0),
        pending: state.pending + (photo.locationStatus === 'pending' ? 1 : 0)
      })
    } catch (err) {
      const reason = isQuotaError(err)
        ? '浏览器存储空间不足，请备份后清理或更换浏览器'
        : err instanceof Error ? err.message : '解析失败'
      setState({ failed: state.failed + 1, errors: [...state.errors, { name: file.name, reason }].slice(-8) })
    }
  }

  setState({ processed: state.total, currentName: '完成', running: false })
  // 后台补全地名（不阻塞 UI）
  void Promise.all(enrichIds.map((id) => enrichPhoto(id)))
}
