import Dexie, { type Table } from 'dexie'
import type { Photo, PhotoBlobs, Journey } from '@/types'

class FootprintsDB extends Dexie {
  photos!: Table<Photo, string>
  blobs!: Table<PhotoBlobs, string>
  journeys!: Table<Journey, string>
  meta!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('footprints')
    this.version(1).stores({
      // 主键 id；hash 唯一索引用于去重
      photos: 'id, &hash, takenAt, importedAt, journeyId, locationStatus, city, countryCode',
      blobs: '&id',
      journeys: '&id, startDate, createdAt',
      meta: '&key'
    })
  }
}

export const db = new FootprintsDB()

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}
