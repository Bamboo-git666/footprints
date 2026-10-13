// 备份 / 恢复：ZIP = metadata.json（照片与旅行元数据）+ originals/（照片原件）
// 恢复时按当前算法重新生成缩略图，保证兼容性。
import JSZip from 'jszip'
import { db, getMeta, setMeta } from './db'
import { generateDerived } from './image'
import { downloadBlob } from './utils'
import { getAllCityDiaries, setCityDiary } from './place'
import type { BackupFile, Journey, Photo } from '@/types'

export interface BackupProgress {
  phase: 'packing' | 'download' | 'reading' | 'restoring'
  percent: number
  detail: string
}

export async function exportBackup(onProgress?: (p: BackupProgress) => void): Promise<void> {
  const [photos, journeys, blobRows, diaries, placeNotes] = await Promise.all([
    db.photos.toCollection().sortBy('takenAt'),
    db.journeys.toArray(),
    db.blobs.toArray(),
    getAllCityDiaries(),
    getMeta<Record<string, string>>('placeNotes', {})
  ])

  const payload: BackupFile = {
    meta: {
      app: 'footprints',
      version: 1,
      exportedAt: Date.now(),
      photoCount: photos.length,
      journeyCount: journeys.length
    },
    photos,
    journeys,
    diaries,
    placeNotes
  }

  const zip = new JSZip()
  zip.file('metadata.json', JSON.stringify(payload, null, 2))
  const dir = zip.folder('originals')
  if (!dir) throw new Error('创建备份目录失败')

  const blobById = new Map(blobRows.map((b) => [b.id, b]))
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]
    const row = blobById.get(photo.id)
    if (row) {
      const ext = photo.fileName.includes('.') ? photo.fileName.split('.').pop()!.toLowerCase() : 'jpg'
      dir.file(`${photo.id}.${ext}`, row.original)
    }
    if (onProgress && i % 5 === 0) {
      onProgress({ phase: 'packing', percent: Math.round((i / Math.max(1, photos.length)) * 60), detail: `收集原件 ${i + 1}/${photos.length}` })
    }
  }

  onProgress?.({ phase: 'packing', percent: 70, detail: '正在压缩…（照片较多时可能需要一些时间）' })
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'STORE' },
    (meta) => onProgress?.({ phase: 'packing', percent: 70 + Math.round(meta.percent * 0.28), detail: '正在压缩备份…' })
  )

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  onProgress?.({ phase: 'download', percent: 100, detail: '开始下载' })
  downloadBlob(blob, `footprints-backup-${stamp}.zip`)
}

export interface RestoreResult {
  added: number
  skipped: number
  failed: { name: string; reason: string }[]
}

export async function importBackup(file: File, onProgress?: (p: BackupProgress) => void): Promise<RestoreResult> {
  onProgress?.({ phase: 'reading', percent: 2, detail: '读取备份文件…' })
  const zip = await JSZip.loadAsync(file)
  const metaFile = zip.file('metadata.json')
  if (!metaFile) throw new Error('备份文件中缺少 metadata.json，可能不是 Footprints 备份。')

  const data = JSON.parse(await metaFile.async('string')) as BackupFile
  if (data?.meta?.app !== 'footprints') throw new Error('无法识别的备份格式。')

  // 建立原件名 → ZipObject 映射（容忍扩展名差异）
  const originalEntries = new Map<string, JSZip.JSZipObject>()
  zip.folder('originals')?.forEach((relativePath, entry) => {
    if (!entry.dir) originalEntries.set(relativePath.toLowerCase(), entry)
  })

  const existingHashes = new Set((await db.photos.orderBy('hash').keys()) as string[])
  const result: RestoreResult = { added: 0, skipped: 0, failed: [] }
  const photos: Photo[] = Array.isArray(data.photos) ? data.photos : []
  const journeys: Journey[] = Array.isArray(data.journeys) ? data.journeys : []

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]
    onProgress?.({
      phase: 'restoring',
      percent: 5 + Math.round((i / Math.max(1, photos.length)) * 90),
      detail: `恢复照片 ${i + 1}/${photos.length}`
    })
    try {
      if (existingHashes.has(photo.hash)) {
        result.skipped++
        continue
      }
      const ext = photo.fileName.includes('.') ? photo.fileName.split('.').pop()!.toLowerCase() : 'jpg'
      const entry = originalEntries.get(`${photo.id}.${ext}`)
        ?? Array.from(originalEntries.entries()).find(([name]) => name.startsWith(`${photo.id}.`))?.[1]
      if (!entry) throw new Error('备份中缺少原件')
      const original = await entry.async('blob')
      const derived = await generateDerived(original)
      await db.transaction('rw', db.photos, db.blobs, async () => {
        await db.photos.put(photo)
        await db.blobs.put({ id: photo.id, original, medium: derived.medium, thumb: derived.thumb })
      })
      existingHashes.add(photo.hash)
      result.added++
    } catch (err) {
      result.failed.push({ name: photo.fileName || photo.id, reason: err instanceof Error ? err.message : '未知错误' })
    }
  }

  // 旅行：id 冲突时跳过（以当前设备上的版本为准）
  const existingJourneyIds = new Set((await db.journeys.toCollection().primaryKeys()) as string[])
  for (const j of journeys) {
    if (!existingJourneyIds.has(j.id)) await db.journeys.put(j)
  }

  // 城市日记 / 地点备注：本地已有同键内容时跳过（不覆盖用户本地编辑），旧备份无此字段
  const localDiaries = await getAllCityDiaries()
  for (const [key, diary] of Object.entries(data.diaries ?? {})) {
    if (!localDiaries[key] && diary?.content) await setCityDiary(key, diary.content)
  }
  const incomingNotes = data.placeNotes ?? {}
  if (Object.keys(incomingNotes).length > 0) {
    const localNotes = await getMeta<Record<string, string>>('placeNotes', {})
    let changed = false
    for (const [key, note] of Object.entries(incomingNotes)) {
      if (!localNotes[key] && typeof note === 'string' && note) {
        localNotes[key] = note
        changed = true
      }
    }
    if (changed) await setMeta('placeNotes', localNotes)
  }

  onProgress?.({ phase: 'restoring', percent: 100, detail: '恢复完成' })
  return result
}
