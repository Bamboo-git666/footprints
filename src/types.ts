// Footprints 核心数据模型
// 所有照片元数据与二进制均持久化于 IndexedDB（Dexie），刷新后不丢失。

export type LocationStatus = 'located' | 'pending'

export type BlobKind = 'original' | 'medium' | 'thumb'

/** 照片元数据（不含二进制，二进制存于 blobs 表） */
export interface Photo {
  /** 主键 UUID */
  id: string
  /** 原始文件 SHA-256，用于去重与备份文件名 */
  hash: string
  fileName: string
  fileType: string
  /** 原始文件字节数 */
  size: number
  width: number
  height: number
  /** 拍摄时间 epoch ms（EXIF 优先，其次文件修改时间） */
  takenAt: number
  importedAt: number

  lat: number | null
  lng: number | null
  locationStatus: LocationStatus

  /** 展示用地点名（逆地理编码或用户手填） */
  placeName: string | null
  city: string | null
  region: string | null
  country: string | null
  countryCode: string | null
  geocodedAt: number | null

  /** 用户编辑字段 */
  name: string | null
  note: string | null

  // 拍摄器材 / EXIF
  camera: string | null
  lens: string | null
  focalLength: number | null
  fNumber: number | null
  iso: number | null
  exposureTime: string | null

  journeyId: string | null
}

/** 照片二进制：原件 + 两档压缩图 */
export interface PhotoBlobs {
  id: string
  original: Blob
  /** 最长边 2048，网格 / 常规浏览使用 */
  medium: Blob
  /** 最长边 400，地图标记 / 缩略图使用 */
  thumb: Blob
}

export interface Journey {
  id: string
  name: string
  description: string | null
  startDate: number | null
  endDate: number | null
  coverPhotoId: string | null
  photoIds: string[]
  createdAt: number
  updatedAt: number
}

export interface BackupMeta {
  app: 'footprints'
  version: 1
  exportedAt: number
  photoCount: number
  journeyCount: number
}

export interface BackupFile {
  meta: BackupMeta
  photos: Photo[]
  journeys: Journey[]
  /** 城市日记（新版备份包含；旧备份无此字段，恢复时容错跳过） */
  diaries?: Record<string, { content: string; updatedAt: number }>
  /** 地点备注（新版备份包含；旧备份无此字段） */
  placeNotes?: Record<string, string>
}

/** 地图上的聚合点 / 单点（内部使用） */
export interface MapPoint {
  photo: Photo
}

export interface AlbumState {
  photoIds: string[]
  /** 关联的焦点坐标（来自标记） */
  focus: { lat: number; lng: number } | null
  /** 面板标题覆盖（如城市相册显示城市名）；缺省时按照片地名推导 */
  title?: string
  /** 面板副标题（如「广东省 · 中国」） */
  subtitle?: string
}

export interface LightboxState {
  photoIds: string[]
  index: number
}
