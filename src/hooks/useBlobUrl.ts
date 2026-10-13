import { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import type { BlobKind } from '@/types'

// 会话级对象 URL 缓存：二进制不可变，重复渲染 / 多标记共享同一 URL
const cache = new Map<string, Promise<string | null>>()

export function fetchBlobUrl(photoId: string, kind: BlobKind): Promise<string | null> {
  const key = `${photoId}:${kind}`
  const hit = cache.get(key)
  if (hit) return hit
  const task = db.blobs
    .get(photoId)
    .then((row) => (row ? URL.createObjectURL(row[kind]) : null))
    .catch(() => null)
  cache.set(key, task)
  return task
}

export function useBlobUrl(photoId: string | null | undefined, kind: BlobKind): string | null {
  const { url } = useBlobUrlResolved(photoId, kind)
  return url
}

/** 带解析状态的版本：resolved=true 表示查询已完成（url 为 null 即缩略图确实缺失） */
export function useBlobUrlResolved(
  photoId: string | null | undefined,
  kind: BlobKind
): { url: string | null; resolved: boolean } {
  const [state, setState] = useState<{ url: string | null; resolved: boolean }>({ url: null, resolved: false })
  useEffect(() => {
    let alive = true
    if (!photoId) {
      setState({ url: null, resolved: true })
      return
    }
    void fetchBlobUrl(photoId, kind).then((u) => {
      if (alive) setState({ url: u, resolved: true })
    })
    return () => {
      alive = false
    }
  }, [photoId, kind])
  return state
}
