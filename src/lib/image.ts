// 图片处理：哈希去重、EXIF 方向校正、缩略图 / 中图生成

export async function readArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return await blob.arrayBuffer()
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

let webpSupported: boolean | null = null
function detectWebP(): boolean {
  if (webpSupported !== null) return webpSupported
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    webpSupported = false
  }
  return webpSupported
}

/** 尊重 EXIF 方向创建位图 */
async function orientedBitmap(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    return await createImageBitmap(blob)
  }
}

function drawToCanvas(bitmap: ImageBitmap, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D 上下文不可用')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement, maxEdge: number, quality: number): Promise<Blob> {
  const type = detectWebP() ? 'image/webp' : 'image/jpeg'
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`生成 ${maxEdge}px 缩略图失败`))),
      type,
      quality
    )
  })
}

export interface DerivedImages {
  width: number
  height: number
  medium: Blob
  thumb: Blob
}

/** 由原件生成两档压缩图。位图用完即关闭以释放内存。 */
export async function generateDerived(source: Blob): Promise<DerivedImages> {
  const bitmap = await orientedBitmap(source)
  try {
    const width = bitmap.width
    const height = bitmap.height
    const mediumCanvas = drawToCanvas(bitmap, 2048)
    const thumbCanvas = drawToCanvas(bitmap, 400)
    const [medium, thumb] = await Promise.all([
      canvasToBlob(mediumCanvas, 2048, 0.82),
      canvasToBlob(thumbCanvas, 400, 0.78)
    ])
    return { width, height, medium, thumb }
  } finally {
    bitmap.close()
  }
}

/** HEIC/HEIF 转 JPEG（动态加载，不拖慢首屏） */
export async function convertHeic(blob: Blob): Promise<Blob> {
  const mod = (await import('heic2any')) as unknown as { default: (opts: unknown) => Promise<Blob | Blob[]> }
  const heic2any = mod.default
  const out = await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 })
  return Array.isArray(out) ? out[0] : out
}

export const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const
export type SupportedExt = (typeof SUPPORTED_EXTENSIONS)[number]

export function isSupportedImage(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)
}
