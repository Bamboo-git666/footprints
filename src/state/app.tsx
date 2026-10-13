import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { uid } from '@/lib/utils'
import { ymd } from '@/lib/utils'
import { drainPendingEnrichment, drainMissingCities, migrateCnCityGroups } from '@/lib/import'
import { buildCityGroups, type CityGroup } from '@/lib/cities'
import { adcodeOf } from '@/lib/city-boundaries'
import type { AlbumState, Journey, LightboxState, Photo } from '@/types'
import type { MapController } from './map-controller'

export type ViewKey = 'map' | 'memories' | 'journeys' | 'stats' | 'settings'

export interface Toast {
  id: string
  title: string
  description?: string
  tone?: 'default' | 'success' | 'error'
}

export interface LocationPick {
  lat: number
  lng: number
  photoIds: string[]
}

export interface PlaceInfo {
  placeName: string
  city: string | null
  region: string | null
  country: string | null
  countryCode: string | null
}

export interface JourneyDraft {
  id?: string
  name: string
  description: string
  startDate: number | null
  endDate: number | null
  coverPhotoId: string | null
  photoIds: string[]
}

/** 时光回放：按拍摄日期在地图上依次重现照片 */
export interface PlaybackState {
  active: boolean
  playing: boolean
  /** 当前回放时间点（epoch ms），拍摄时间 ≤ 该值的照片显示在地图上 */
  until: number | null
  speed: number
}

interface AppContextValue {
  ready: boolean
  photos: Photo[]
  journeys: Journey[]
  photoMap: Map<string, Photo>

  view: ViewKey
  setView: (v: ViewKey) => void

  year: number | null
  setYear: (y: number | null) => void
  journeyFilterId: string | null
  setJourneyFilterId: (id: string | null) => void
  visiblePhotos: Photo[]
  locatedPhotos: Photo[]
  pendingPhotos: Photo[]
  years: number[]

  playback: PlaybackState
  startPlayback: () => void
  stopPlayback: () => void
  setPlaybackPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void
  setPlaybackUntil: (t: number) => void
  advancePlayback: (delta: number) => void
  /** 地图标记使用的数据：时光回放激活时按拍摄时间过滤 */
  mapMarkerPhotos: Photo[]

  /** 城市级归组（当前筛选 / 回放范围内）——地图标记数据源 */
  cityMarkerGroups: CityGroup[]
  /** 全部照片的城市归组（统计用） */
  allCityGroups: CityGroup[]
  /** 已定位但无法判定城市的照片（待确认城市） */
  cityPendingPhotos: Photo[]
  /** 中国境内仍是区/乡镇级归属、等待城市提升的照片 */
  cityLegacyPhotos: Photo[]
  /** 已点亮的城市（有已定位照片即点亮；全量照片口径，不受年份/旅行筛选影响） */
  litCities: { key: string; city: string; region: string | null; count: number; photoIds: string[] }[]
  /** 手动点亮的城市名（无照片也点亮，localStorage 持久化） */
  manualLit: string[]
  /** 手动点亮城市：校验行政区划匹配，成功返回 true（匹配失败弹错误提示） */
  addManualLit: (name: string) => boolean
  removeManualLit: (name: string) => void

  album: AlbumState | null
  openAlbum: (photoIds: string[], focus?: AlbumState['focus'], meta?: { title?: string; subtitle?: string }) => void
  closeAlbum: () => void

  lightbox: LightboxState | null
  openLightbox: (photoIds: string[], index?: number) => void
  closeLightbox: () => void
  stepLightbox: (delta: number) => void
  setLightboxIndex: (i: number) => void

  pickingIds: string[] | null
  startPicking: (photoIds: string[]) => void
  cancelPicking: () => void
  locationPick: LocationPick | null
  resolvePicking: (lat: number, lng: number) => void
  cancelLocationPick: () => void
  applyLocation: (
    photoIds: string[],
    lat: number,
    lng: number,
    place?: PlaceInfo | null
  ) => Promise<void>

  editingId: string | null
  openEditor: (id: string) => void
  closeEditor: () => void

  updatePhoto: (id: string, patch: Partial<Photo>) => Promise<void>
  /** 批量更新多张照片（如修改地点展示名） */
  updatePhotos: (ids: string[], patch: Partial<Photo>) => Promise<void>
  deletePhoto: (id: string) => Promise<void>
  /** 批量删除多张照片（含缩略图与旅行引用清理） */
  deletePhotos: (ids: string[]) => Promise<void>

  saveJourney: (draft: JourneyDraft) => Promise<Journey>
  deleteJourney: (id: string) => Promise<void>

  mapCtl: MutableRefObject<MapController | null>
  registerMap: (ctl: MapController | null) => void
  /** 请求地图定位到指定坐标（跨页面 / 关闭面板后使用，MapView 消费后不会恢复旧视角） */
  mapFocus: { lng: number; lat: number; zoom?: number; ts: number } | null
  requestMapFocus: (lng: number, lat: number, zoom?: number) => void

  toasts: Toast[]
  toast: (title: string, description?: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const photos = useLiveQuery(() => db.photos.toCollection().sortBy('takenAt'), [], []) as Photo[] | undefined
  const journeys = useLiveQuery(() => db.journeys.toCollection().sortBy('createdAt'), [], []) as Journey[] | undefined

  const [view, setView] = useState<ViewKey>('map')
  const [year, setYear] = useState<number | null>(null)
  const [journeyFilterId, setJourneyFilterId] = useState<string | null>(null)
  const [album, setAlbum] = useState<AlbumState | null>(null)
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)
  const [pickingIds, setPickingIds] = useState<string[] | null>(null)
  const pickingIdsRef = useRef<string[] | null>(null)
  pickingIdsRef.current = pickingIds
  const [locationPick, setLocationPick] = useState<LocationPick | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [playback, setPlayback] = useState<PlaybackState>({ active: false, playing: false, until: null, speed: 1 })
  const mapCtl = useRef<MapController | null>(null)

  const ready = photos !== undefined && journeys !== undefined
  const allPhotos = useMemo(() => photos ?? [], [photos])
  const allJourneys = useMemo(() => journeys ?? [], [journeys])
  const photoMap = useMemo(() => new Map(allPhotos.map((p) => [p.id, p])), [allPhotos])

  // 启动后尝试补全地名与城市归属（受地理编码队列限速，网络失败静默）；
  // 最后执行中国区级城市迁移（南山区 → 深圳市等，存量数据分批完成）
  const enrichedRef = useRef(false)
  if (ready && !enrichedRef.current) {
    enrichedRef.current = true
    void drainPendingEnrichment()
      .then(() => drainMissingCities())
      .then(() => migrateCnCityGroups())
  }

  const years = useMemo(() => {
    const set = new Set<number>()
    for (const p of allPhotos) set.add(ymd(p.takenAt).year)
    return Array.from(set).sort((a, b) => b - a)
  }, [allPhotos])

  const visiblePhotos = useMemo(() => {
    return allPhotos
      .filter((p) => (year === null ? true : ymd(p.takenAt).year === year))
      .filter((p) => (journeyFilterId === null ? true : p.journeyId === journeyFilterId))
  }, [allPhotos, year, journeyFilterId])

  const locatedPhotos = useMemo(() => visiblePhotos.filter((p) => p.lat !== null && p.lng !== null), [visiblePhotos])
  const pendingPhotos = useMemo(() => allPhotos.filter((p) => p.locationStatus === 'pending'), [allPhotos])

  const toast = useCallback((title: string, description?: string, tone: Toast['tone'] = 'default') => {
    const id = uid()
    setToasts((ts) => [...ts, { id, title, description, tone }])
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 4200)
  }, [])
  const dismissToast = useCallback((id: string) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])

  // ---- 时光回放 ----
  const startPlayback = useCallback(() => {
    if (locatedPhotos.length === 0) {
      toast('没有可回放的照片', '当前筛选下没有已定位的照片')
      return
    }
    const times = locatedPhotos.map((p) => p.takenAt)
    setPlayback({ active: true, playing: true, until: Math.min(...times), speed: 1 })
  }, [locatedPhotos, toast])
  const stopPlayback = useCallback(
    () => setPlayback({ active: false, playing: false, until: null, speed: 1 }),
    []
  )
  const setPlaybackPlaying = useCallback(
    (playing: boolean) => setPlayback((pb) => (pb.active ? { ...pb, playing } : pb)),
    []
  )
  const setPlaybackSpeed = useCallback((speed: number) => setPlayback((pb) => ({ ...pb, speed })), [])
  const setPlaybackUntil = useCallback((t: number) => setPlayback((pb) => ({ ...pb, until: t })), [])
  const advancePlayback = useCallback((delta: number) => {
    setPlayback((pb) => {
      if (!pb.active || pb.until === null) return pb
      return { ...pb, until: pb.until + delta }
    })
  }, [])

  const mapMarkerPhotos = useMemo(() => {
    if (!playback.active || playback.until === null) return locatedPhotos
    return locatedPhotos.filter((p) => p.takenAt <= playback.until!)
  }, [locatedPhotos, playback.active, playback.until])

  // 城市级归组：随筛选 / 回放范围实时更新（年份筛选后城市照片数量同步变化）
  const cityMarkerGroups = useMemo(() => buildCityGroups(mapMarkerPhotos), [mapMarkerPhotos])
  const allCityGroups = useMemo(() => buildCityGroups(locatedPhotos), [locatedPhotos])
  const cityPendingPhotos = useMemo(
    () => allPhotos.filter((p) => p.lat !== null && p.lng !== null && !p.city),
    [allPhotos]
  )
  const cityLegacyPhotos = useMemo(
    () => allPhotos.filter((p) => p.countryCode === 'CN' && !!p.city && !p.city.endsWith('市')),
    [allPhotos]
  )

  // 点亮城市：每座有已定位照片的城市即点亮（规则从简，不区分国家 / 行政级别）；
  // 手动点亮的城市（无照片）合并到列表尾部，区域点亮共用同一链路
  const [manualLit, setManualLitState] = useState<string[]>(() => {
    try {
      const arr = JSON.parse(localStorage.getItem('footprints:manualLit') ?? '[]')
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
  })

  const addManualLit = useCallback(
    (name: string): boolean => {
      const n = name.trim()
      if (!n) return false
      if (adcodeOf(n) === null) {
        toast('未找到该城市', '试试标准城市名，如「景德镇」「苏州市」', 'error')
        return false
      }
      if (manualLit.includes(n)) {
        toast('该城市已点亮')
        return false
      }
      const next = [...manualLit, n]
      setManualLitState(next)
      localStorage.setItem('footprints:manualLit', JSON.stringify(next))
      return true
    },
    [manualLit, toast]
  )
  const removeManualLit = useCallback((name: string) => {
    setManualLitState((cur) => {
      const next = cur.filter((x) => x !== name)
      localStorage.setItem('footprints:manualLit', JSON.stringify(next))
      return next
    })
  }, [])

  const litCities = useMemo(() => {
    const fromPhotos = buildCityGroups(allPhotos).map((g) => ({
      key: g.key,
      city: g.city,
      region: g.region,
      count: g.photos.length,
      photoIds: g.photos.map((p) => p.id)
    }))
    const manual = manualLit
      .filter((n) => !fromPhotos.some((g) => g.city === n))
      .map((n) => ({ key: `manual:${n}`, city: n, region: null, count: 0, photoIds: [] as string[] }))
    return [...fromPhotos, ...manual]
  }, [allPhotos, manualLit])

  // 新城市点亮提醒：以照片数据加载完成（ready）为准建立基线，
  // 避免启动加载数据时把已有城市误报为「新点亮」，照片库变大也不会误报
  const litKeysRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!ready) return
    const keys = new Set(litCities.map((r) => r.key))
    const prev = litKeysRef.current
    litKeysRef.current = keys
    if (!prev) return
    const fresh = litCities.filter((r) => !prev.has(r.key))
    if (fresh.length === 0) return
    if (fresh.length === 1) {
      toast(`新点亮 · ${fresh[0].city}`, `已点亮 ${litCities.length} 座城市`, 'success')
    } else {
      toast(`新点亮 ${fresh.length} 座城市`, `${fresh.slice(0, 3).map((r) => r.city).join('、')} 等 · 已点亮 ${litCities.length} 座`, 'success')
    }
  }, [litCities, ready, toast])

  const openAlbum = useCallback(
    (photoIds: string[], focus: AlbumState['focus'] = null, meta?: { title?: string; subtitle?: string }) => {
      if (photoIds.length === 0) return
      setAlbum({ photoIds, focus, title: meta?.title, subtitle: meta?.subtitle })
    },
    []
  )
  const closeAlbum = useCallback(() => setAlbum(null), [])

  const openLightbox = useCallback((photoIds: string[], index = 0) => {
    if (photoIds.length === 0) return
    setLightbox({ photoIds, index })
  }, [])
  const closeLightbox = useCallback(() => setLightbox(null), [])
  const setLightboxIndex = useCallback(
    (i: number) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb)),
    []
  )
  const stepLightbox = useCallback((delta: number) => {
    setLightbox((lb) => {
      if (!lb || lb.photoIds.length < 2) return lb
      const n = lb.photoIds.length
      return { ...lb, index: (lb.index + delta + n) % n }
    })
  }, [])

  const startPicking = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setAlbum(null)
    setView('map')
    setPickingIds(ids)
  }, [])
  const cancelPicking = useCallback(() => setPickingIds(null), [])
  const resolvePicking = useCallback(
    (lat: number, lng: number) => {
      const ids = pickingIdsRef.current
      if (ids && ids.length) setLocationPick({ lat, lng, photoIds: ids })
    },
    []
  )
  const cancelLocationPick = useCallback(() => setLocationPick(null), [])

  const applyLocation = useCallback(
    async (
      photoIds: string[],
      lat: number,
      lng: number,
      place: PlaceInfo | null = null
    ) => {
      await db.transaction('rw', db.photos, async () => {
        for (const id of photoIds) {
          await db.photos.update(id, {
            lat,
            lng,
            locationStatus: 'located',
            placeName: place?.placeName ?? null,
            city: place?.city ?? null,
            region: place?.region ?? null,
            country: place?.country ?? null,
            countryCode: place?.countryCode ?? null,
            geocodedAt: place ? Date.now() : null
          })
        }
      })
      setPickingIds(null)
      setLocationPick(null)
      toast('位置已保存', `${photoIds.length} 张照片已放置到地图上`, 'success')
    },
    [toast]
  )

  const openEditor = useCallback((id: string) => setEditingId(id), [])
  const closeEditor = useCallback(() => setEditingId(null), [])

  const updatePhoto = useCallback(
    async (id: string, patch: Partial<Photo>) => {
      await db.photos.update(id, patch)
    },
    []
  )

  const updatePhotos = useCallback(
    async (ids: string[], patch: Partial<Photo>) => {
      if (ids.length === 0) return
      await db.transaction('rw', db.photos, async () => {
        for (const id of ids) await db.photos.update(id, patch)
      })
    },
    []
  )

  const deletePhotos = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return
      await db.transaction('rw', db.photos, db.blobs, db.journeys, async () => {
        for (const id of ids) {
          await db.photos.delete(id)
          await db.blobs.delete(id)
          const affected = await db.journeys.filter((j) => j.photoIds.includes(id)).toArray()
          for (const j of affected) {
            await db.journeys.update(j.id, {
              photoIds: j.photoIds.filter((pid) => pid !== id),
              coverPhotoId: j.coverPhotoId === id ? null : j.coverPhotoId
            })
          }
        }
      })
      setLightbox((lb) => {
        if (!lb || !lb.photoIds.some((pid) => ids.includes(pid))) return lb
        const next = lb.photoIds.filter((pid) => !ids.includes(pid))
        if (next.length === 0) return null
        return { photoIds: next, index: Math.min(lb.index, next.length - 1) }
      })
      setAlbum((a) =>
        a && a.photoIds.some((pid) => ids.includes(pid))
          ? { ...a, photoIds: a.photoIds.filter((pid) => !ids.includes(pid)) }
          : a
      )
      setEditingId(null)
      toast(ids.length === 1 ? '照片已删除' : `已删除 ${ids.length} 张照片`)
    },
    [toast]
  )

  const deletePhoto = useCallback(async (id: string) => deletePhotos([id]), [deletePhotos])

  const saveJourney = useCallback(
    async (draft: JourneyDraft): Promise<Journey> => {
      let journey: Journey
      await db.transaction('rw', db.journeys, db.photos, async () => {
        const now = Date.now()
        if (draft.id) {
          const existing = await db.journeys.get(draft.id)
          if (!existing) throw new Error('旅行不存在')
          const nextIds = draft.photoIds
          const removed = new Set(existing.photoIds.filter((id) => !nextIds.includes(id)))
          for (const id of removed) await db.photos.update(id, { journeyId: null })
          for (const id of nextIds) await db.photos.update(id, { journeyId: draft.id! })
          journey = {
            ...existing,
            name: draft.name,
            description: draft.description || null,
            startDate: draft.startDate,
            endDate: draft.endDate,
            coverPhotoId: draft.coverPhotoId,
            photoIds: nextIds,
            updatedAt: now
          }
          await db.journeys.put(journey)
        } else {
          const id = uid()
          journey = {
            id,
            name: draft.name,
            description: draft.description || null,
            startDate: draft.startDate,
            endDate: draft.endDate,
            coverPhotoId: draft.coverPhotoId,
            photoIds: draft.photoIds,
            createdAt: now,
            updatedAt: now
          }
          await db.journeys.add(journey)
          for (const pid of draft.photoIds) await db.photos.update(pid, { journeyId: id })
        }
      })
      toast('旅行已保存', undefined, 'success')
      return journey!
    },
    [toast]
  )

  const deleteJourney = useCallback(
    async (id: string) => {
      await db.transaction('rw', db.journeys, db.photos, async () => {
        const j = await db.journeys.get(id)
        if (j) for (const pid of j.photoIds) await db.photos.update(pid, { journeyId: null })
        await db.journeys.delete(id)
      })
      setJourneyFilterId((cur) => (cur === id ? null : cur))
      toast('旅行已删除')
    },
    [toast]
  )

  const registerMap = useCallback((ctl: MapController | null) => {
    mapCtl.current = ctl
  }, [])

  const [mapFocus, setMapFocus] = useState<{ lng: number; lat: number; zoom?: number; ts: number } | null>(null)
  const requestMapFocus = useCallback((lng: number, lat: number, zoom?: number) => {
    setMapFocus({ lng, lat, zoom, ts: Date.now() })
  }, [])

  const value: AppContextValue = {
    ready,
    photos: allPhotos,
    journeys: allJourneys,
    photoMap,
    view,
    setView,
    year,
    setYear,
    journeyFilterId,
    setJourneyFilterId,
    visiblePhotos,
    locatedPhotos,
    pendingPhotos,
    years,
    playback,
    startPlayback,
    stopPlayback,
    setPlaybackPlaying,
    setPlaybackSpeed,
    setPlaybackUntil,
    advancePlayback,
    mapMarkerPhotos,
    cityMarkerGroups,
    allCityGroups,
    cityPendingPhotos,
    cityLegacyPhotos,
    litCities,
    manualLit,
    addManualLit,
    removeManualLit,
    album,
    openAlbum,
    closeAlbum,
    lightbox,
    openLightbox,
    closeLightbox,
    stepLightbox,
    setLightboxIndex,
    pickingIds,
    startPicking,
    cancelPicking,
    locationPick,
    resolvePicking,
    cancelLocationPick,
    applyLocation,
    editingId,
    openEditor,
    closeEditor,
    updatePhoto,
    updatePhotos,
    deletePhoto,
    deletePhotos,
    saveJourney,
    deleteJourney,
    mapCtl,
    registerMap,
    mapFocus,
    requestMapFocus,
    toasts,
    toast,
    dismissToast
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用')
  return ctx
}
