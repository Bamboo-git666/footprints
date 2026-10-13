import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type Map as MLMap, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { AnimatePresence, motion } from 'framer-motion'
import { Crosshair, Hand, History, LocateFixed, MapPin, Minus, Mouse, Plus, RefreshCw, Sparkles, X } from 'lucide-react'
import { useApp } from '@/state/app'
import { useTheme } from '@/hooks/useTheme'
import { loadMapStyle, mapSky } from './map-style'
import { MarkersLayer, type CityMarkerClick } from './MarkersLayer'
import { CityGlowLayer } from './CityGlowLayer'
import { ManualLitDialog } from './ManualLitDialog'
import { CityListPopup } from './CityListPopup'
import { PlaybackBar } from './PlaybackBar'
import { CityEngine, type CityGroup } from '@/lib/cities'
import { boundsOf, padBounds } from '@/lib/geo'
import { cn } from '@/lib/utils'
import { ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

const VIEW_KEY = 'footprints:mapview'
const NAV_KEY = 'footprints:mapNav'
const DEFAULT_VIEW = { lng: 105, lat: 31, zoom: 2.2 }

interface SavedView {
  lng: number
  lat: number
  zoom: number
}

function readView(): SavedView | null {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (typeof v.lng === 'number' && typeof v.lat === 'number' && typeof v.zoom === 'number') return v
  } catch {
    /* ignore */
  }
  return null
}

function readNavMode(): 'standard' | 'trackpad' {
  return localStorage.getItem(NAV_KEY) === 'trackpad' ? 'trackpad' : 'standard'
}

/** 全球聚合点弹出的城市列表状态 */
interface CityListState {
  cities: CityGroup[]
  lng: number
  lat: number
  x: number
  y: number
  clusterId?: number
}

export function MapView() {
  const app = useApp()
  const { resolved } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MLMap | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [cityList, setCityList] = useState<CityListState | null>(null)
  const [navMode, setNavMode] = useState<'standard' | 'trackpad'>(readNavMode)
  const [manualLitOpen, setManualLitOpen] = useState(false)

  const pickingRef = useRef(false)
  pickingRef.current = app.pickingIds !== null
  const locatedRef = useRef(app.locatedPhotos)
  locatedRef.current = app.locatedPhotos
  const themeRef = useRef(resolved)
  themeRef.current = resolved
  const didFitRef = useRef(false)
  const hadSavedView = useRef<boolean>(readView() !== null)
  /** 从地图打开相册前的视角，关闭相册时恢复 */
  const viewBeforeAlbumRef = useRef<SavedView | null>(null)

  // 城市级聚合引擎：城市点而非照片点（当前筛选 / 回放范围内）
  const engine = useMemo(() => new CityEngine(app.cityMarkerGroups), [app.cityMarkerGroups])

  // 初始化加载增强底图（中文地名优先 + 降噪 + Globe 投影 + 主题天空）；失败时 loadMapStyle 回退为官方样式 URL
  const [mapStyle, setMapStyle] = useState<StyleSpecification | string | null>(null)
  useEffect(() => {
    let alive = true
    void loadMapStyle(resolved === 'light' ? 'light' : 'dark').then((s) => {
      if (alive) setMapStyle(s)
    })
    return () => {
      alive = false
    }
    // 仅初始化执行一次；后续主题切换走 setStyle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 样式就绪后创建地图（单次创建，避免重复 setStyle 打断首次加载）
  useEffect(() => {
    if (!containerRef.current || !mapStyle || map) return
    const saved = readView() ?? DEFAULT_VIEW
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [saved.lng, saved.lat],
      zoom: saved.zoom,
      minZoom: 1,
      maxZoom: 20,
      attributionControl: false,
      fadeDuration: 0
    })
    m.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · 行政区划边界 <a href="https://geo.datav.aliyun.com/" target="_blank" rel="noreferrer">Aliyun DataV</a>'
      }),
      'bottom-right'
    )
    // 双保险：即使样式回退为官方 URL（未携带 projection/sky），也保证地球与天空生效
    m.on('style.load', () => {
      m.setProjection({ type: 'globe' })
      m.setSky(mapSky(themeRef.current === 'light' ? 'light' : 'dark'))
    })
    setMap(m)

    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      m.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle])

  // 主题切换：应用转换后的样式对象（跳过挂载时的冗余 setStyle——
  // 重复调用会打断样式的首次加载，导致瓦片请求永不发出）
  const appliedThemeRef = useRef(resolved)
  useEffect(() => {
    if (!map) return
    if (appliedThemeRef.current === resolved) return
    appliedThemeRef.current = resolved
    let alive = true
    void loadMapStyle(resolved === 'light' ? 'light' : 'dark').then((s) => {
      if (alive && map) map.setStyle(s)
    })
    return () => {
      alive = false
    }
  }, [map, resolved])

  // 注册控制器 & 事件
  useEffect(() => {
    if (!map) return
    const saveView = () => {
      const c = map.getCenter()
      localStorage.setItem(VIEW_KEY, JSON.stringify({ lng: c.lng, lat: c.lat, zoom: map.getZoom() }))
    }
    const onMoveStart = () => setCityList(null)
    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (pickingRef.current) app.resolvePicking(e.lngLat.lat, e.lngLat.lng)
    }
    map.on('moveend', saveView)
    map.on('movestart', onMoveStart)
    map.on('click', onClick)

    app.registerMap({
      flyTo: (lng, lat, zoom) => {
        map.flyTo({ center: [lng, lat], zoom: zoom ?? Math.max(map.getZoom(), 13), speed: 1.15, essential: true })
      },
      fitPhotoPoints: (points, maxZoom = 16) => {
        const b = boundsOf(points)
        if (!b) return
        if (b.maxLng - b.minLng < 0.0001 && b.maxLat - b.minLat < 0.0001) {
          map.flyTo({ center: [b.minLng, b.minLat], zoom: Math.max(map.getZoom(), 14), essential: true })
          return
        }
        map.fitBounds(
          [
            [padBounds(b).minLng, padBounds(b).minLat],
            [padBounds(b).maxLng, padBounds(b).maxLat]
          ],
          { padding: { top: 110, bottom: 130, left: 100, right: 100 }, maxZoom, duration: 1200, essential: true }
        )
      },
      fitAll: () => {
        const b = boundsOf(locatedRef.current)
        if (!b) return
        if (b.maxLng - b.minLng < 0.0001 && b.maxLat - b.minLat < 0.0001) {
          map.flyTo({ center: [b.minLng, b.minLat], zoom: 13, essential: true })
          return
        }
        map.fitBounds(
          [
            [padBounds(b, 0.25).minLng, padBounds(b, 0.25).minLat],
            [padBounds(b, 0.25).maxLng, padBounds(b, 0.25).maxLat]
          ],
          { padding: 80, duration: 1200, essential: true }
        )
      },
      getCenter: () => {
        const c = map.getCenter()
        return { lat: c.lat, lng: c.lng }
      },
      getZoom: () => map.getZoom()
    })
    return () => {
      map.off('moveend', saveView)
      map.off('movestart', onMoveStart)
      map.off('click', onClick)
      app.registerMap(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  // 首次出现已定位照片时调整视野（仅一次，之后保留用户视角）
  useEffect(() => {
    if (!map || didFitRef.current) return
    if (hadSavedView.current) {
      didFitRef.current = true
      return
    }
    if (app.locatedPhotos.length > 0) {
      didFitRef.current = true
      const b = boundsOf(app.locatedPhotos)
      if (b) {
        const bb = padBounds(b, 0.25)
        map.fitBounds(
          [
            [bb.minLng, bb.minLat],
            [bb.maxLng, bb.maxLat]
          ],
          { padding: 80, duration: 0 }
        )
      }
    }
  }, [map, app.locatedPhotos])

  // 选点模式光标
  useEffect(() => {
    if (!map) return
    map.getCanvas().style.cursor = app.pickingIds ? 'crosshair' : ''
  }, [map, app.pickingIds])

  /** 直接打开城市相册：一次点击回到该城市的全部回忆 */
  const openCityAlbum = useCallback(
    (g: CityGroup) => {
      if (!map) return
      const c = map.getCenter()
      viewBeforeAlbumRef.current = { lng: c.lng, lat: c.lat, zoom: map.getZoom() }
      // 把目标移到「抽屉未遮挡的可视区域」中心：
      // 桌面右侧抽屉 → 向左偏移；移动端底部 Bottom Sheet → 向上偏移
      const w = window.innerWidth
      const h = window.innerHeight
      const offset: [number, number] = w >= 768 ? [-Math.min(240, w * 0.2), 0] : [0, -h * 0.36]
      map.easeTo({ center: [g.lng, g.lat], offset, duration: 550, essential: true })
      app.openAlbum(g.photos.map((p) => p.id), { lat: g.lat, lng: g.lng }, {
        title: g.city,
        subtitle: [g.region, g.country].filter(Boolean).join(' · ')
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map]
  )

  const handleMarker = useCallback(
    (info: CityMarkerClick) => {
      // 时光回放中点击标记 → 先暂停，便于驻足查看
      if (app.playback.active && app.playback.playing) app.setPlaybackPlaying(false)

      // 城市标记：一次点击直接打开城市相册
      if (info.kind === 'city' && info.group) {
        openCityAlbum(info.group)
        return
      }
      // 全球聚合点：弹出城市列表，无须逐级放大
      setCityList({
        cities: info.cities,
        lng: info.lng,
        lat: info.lat,
        x: info.x,
        y: info.y,
        clusterId: info.clusterId
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openCityAlbum]
  )

  const zoomToCluster = useCallback(() => {
    if (!map || !cityList || cityList.clusterId === undefined) return
    const ez = engine.expansionZoom(cityList.clusterId)
    map.easeTo({
      center: [cityList.lng, cityList.lat],
      zoom: Math.min(ez + 0.3, 18),
      duration: 650,
      essential: true
    })
    setCityList(null)
  }, [map, cityList, engine])

  // 处理跨组件定位请求（先于相册恢复 effect 定义：清空恢复点后，关闭面板不再回退旧视角）
  useEffect(() => {
    if (!map || !app.mapFocus) return
    viewBeforeAlbumRef.current = null
    const { lng, lat, zoom } = app.mapFocus
    map.flyTo({ center: [lng, lat], zoom: zoom ?? Math.max(map.getZoom(), 15), speed: 1.2, essential: true })
  }, [app.mapFocus, map])

  // 关闭相册后恢复打开前的地图视角
  useEffect(() => {
    if (!map) return
    if (!app.album && viewBeforeAlbumRef.current) {
      const v = viewBeforeAlbumRef.current
      viewBeforeAlbumRef.current = null
      if (app.view === 'map') {
        map.easeTo({ center: [v.lng, v.lat], zoom: v.zoom, duration: 550, essential: true })
      }
    }
  }, [app.album, app.view, map])

  // ---- 滚轮 / 触控板操作模式 ----
  // 标准模式（默认）：滚轮缩放（围绕指针位置），右键拖动旋转，双击放大 —— MapLibre 原生。
  // 触控板优先模式：双指滑动平移；捏合（浏览器转发为 ctrl+滚轮）仍交给 MapLibre 平滑缩放。
  useEffect(() => {
    if (!map || navMode !== 'trackpad') return
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // 捏合手势 / Ctrl+滚轮 → 保持原生缩放（MapLibre 自带平滑与 preventDefault，避免页面缩放冲突）
      if (e.ctrlKey || e.metaKey) return
      // 其余滚轮事件在捕获阶段拦截为地图平移，不进入页面滚动 / 地图缩放
      e.preventDefault()
      e.stopPropagation()
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1
      map.panBy([-e.deltaX * scale, -e.deltaY * scale], { animate: false })
    }
    el.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => el.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions)
  }, [map, navMode])

  const toggleNavMode = useCallback(() => {
    setNavMode((m) => {
      const next = m === 'standard' ? 'trackpad' : 'standard'
      localStorage.setItem(NAV_KEY, next)
      app.toast(
        next === 'trackpad' ? '已切换到触控板优先模式' : '已切换到标准地图模式',
        next === 'trackpad' ? '双指滑动平移地图 · 捏合缩放 · Ctrl+滚轮缩放' : '滚轮缩放 · 拖动平移 · 右键拖动旋转 · 双击放大'
      )
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const geolocate = () => {
    if (!navigator.geolocation) {
      app.toast('当前浏览器不支持定位')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => map?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14, essential: true }),
      () => app.toast('无法获取当前位置', '请检查浏览器定位权限', 'error'),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const lx = cityList ? Math.min(Math.max(cityList.x, 150), Math.max(150, size.w - 150)) : 0
  const ly = cityList ? Math.max(cityList.y, 340) : 0

  const activeJourney = app.journeyFilterId ? app.journeys.find((j) => j.id === app.journeyFilterId) : null

  return (
    <div className="absolute inset-0 overflow-hidden bg-bg">
      <div ref={containerRef} className="absolute inset-0" />

      {map && <CityGlowLayer map={map} cities={app.litCities} />}
      {map && <MarkersLayer map={map} engine={engine} onMarker={handleMarker} />}

      {/* 时光回放控制条 */}
      <AnimatePresence>{app.playback.active && <PlaybackBar />}</AnimatePresence>

      {/* 全球聚合点：城市列表弹层 */}
      <AnimatePresence>
        {cityList && cityList.cities.length > 0 && (
          <CityListPopup
            key="city-list"
            cities={cityList.cities}
            x={lx}
            y={ly}
            onPick={(g) => {
              setCityList(null)
              openCityAlbum(g)
            }}
            onZoom={zoomToCluster}
            onClose={() => setCityList(null)}
          />
        )}
      </AnimatePresence>

      {/* 年份 / 旅行筛选 */}
      <div className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)+72px)] z-20 flex w-full max-w-[92vw] -translate-x-1/2 justify-center">
        <div className="no-scrollbar pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full panel-glass border border-line/10 px-2 py-1.5 shadow-marker">
          <FilterChip active={app.year === null && !activeJourney} onClick={() => { app.setYear(null); app.setJourneyFilterId(null) }}>
            全部
          </FilterChip>
          {activeJourney && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent">
              {activeJourney.name}
              <button onClick={() => app.setJourneyFilterId(null)} aria-label="清除旅行筛选">
                <X size={12} />
              </button>
            </span>
          )}
          {app.years.map((y) => (
            <FilterChip key={y} active={app.year === y && !activeJourney} onClick={() => app.setYear(app.year === y ? null : y)}>
              {y}
            </FilterChip>
          ))}
          {/* 时光回放入口 */}
          <button
            type="button"
            onClick={() => (app.playback.active ? app.stopPlayback() : app.startPlayback())}
            aria-label="时光回放"
            title="按拍摄日期在地图上回放照片"
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition',
              app.playback.active
                ? 'bg-accent/15 text-accent'
                : 'text-accent/90 hover:bg-accent/10 hover:text-accent'
            )}
          >
            <History size={12} />
            时光回放
          </button>
        </div>
      </div>

      {/* 右侧地图操作：按功能分组的轻量玻璃胶囊 */}
      <div className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-2">
        <ControlGroup>
          <MapControlBtn onClick={() => map?.zoomIn()} label="放大"><Plus size={18} /></MapControlBtn>
          <MapControlBtn onClick={() => map?.zoomOut()} label="缩小"><Minus size={18} /></MapControlBtn>
        </ControlGroup>
        <ControlGroup>
          <MapControlBtn onClick={() => map && app.mapCtl.current?.fitAll()} label="显示全部照片"><MapPin size={16} /></MapControlBtn>
          <MapControlBtn onClick={geolocate} label="定位到我"><LocateFixed size={16} /></MapControlBtn>
        </ControlGroup>
        <ControlGroup>
          <MapControlBtn onClick={() => setManualLitOpen(true)} label="手动点亮城市">
            <Sparkles size={16} />
          </MapControlBtn>
        </ControlGroup>
        <ControlGroup>
          <MapControlBtn
            onClick={toggleNavMode}
            label={navMode === 'standard' ? '切换到触控板优先模式' : '切换到标准地图模式'}
            active={navMode === 'trackpad'}
          >
            {navMode === 'standard' ? <Mouse size={16} /> : <Hand size={16} />}
          </MapControlBtn>
          <MapControlBtn onClick={() => window.location.reload()} label="刷新界面">
            <RefreshCw size={16} />
          </MapControlBtn>
        </ControlGroup>
      </div>

      {/* 手动点亮城市弹窗 */}
      <ManualLitDialog open={manualLitOpen} onClose={() => setManualLitOpen(false)} />

      {/* 选点模式提示 */}
      <AnimatePresence>
        {app.pickingIds && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="absolute bottom-28 left-1/2 z-30 w-[min(92vw,460px)] -translate-x-1/2"
          >
            <div className="flex items-center gap-3 rounded-2xl panel-glass border border-accent/30 px-4 py-3 shadow-float">
              <Crosshair size={20} className="shrink-0 animate-pulse-ring rounded-full text-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">点击地图选择拍摄位置</p>
                <p className="truncate text-xs text-muted">
                  将为 {app.pickingIds.length} 张照片设置同一坐标 · 不会猜测位置
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={app.cancelPicking}>取消</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 城市确认引导：照片已导入但当前没有任何城市标记时出现（如地名服务不可达） */}
      <AnimatePresence>
        {app.ready &&
          app.photos.length > 0 &&
          app.cityMarkerGroups.length === 0 &&
          !app.pickingIds &&
          app.year === null &&
          !app.journeyFilterId &&
          (app.cityPendingPhotos.length > 0 || app.pendingPhotos.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              className="absolute bottom-28 left-1/2 z-20 w-[min(92vw,460px)] -translate-x-1/2"
            >
              <div className="rounded-2xl panel-glass border border-accent/25 px-4 py-3.5 shadow-float">
                <p className="text-sm font-semibold text-fg">照片已导入，等待确认城市</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {app.cityPendingPhotos.length > 0 &&
                    `${app.cityPendingPhotos.length} 张已定位的照片还没有城市归属（地名服务暂时不可达），指定城市后就会出现在地图上。`}
                  {app.cityPendingPhotos.length > 0 && app.pendingPhotos.length > 0 && ' '}
                  {app.pendingPhotos.length > 0 &&
                    `${app.pendingPhotos.length} 张照片没有 GPS 信息，需要手动定位。`}
                </p>
                <div className="mt-3">
                  <Button size="sm" onClick={() => window.dispatchEvent(new CustomEvent('footprints:pending'))}>
                    打开待处理面板
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* 空状态 */}
      <AnimatePresence>
        {app.ready && app.photos.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6"
          >
            <div className="pointer-events-auto max-w-md text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-line/10 panel-glass">
                <ImagePlus size={26} className="text-accent" />
              </div>
              <h1 className="font-serif text-display italic tracking-tight text-fg">
                世界有待记录
              </h1>
              <p className="mx-auto mt-4 max-w-sm text-balance text-sm leading-relaxed text-muted">
                导入带有定位信息的照片，它们会自动出现在地图上；没有 GPS 的照片可由你手动指定位置。照片只保存在这台设备上。
              </p>
              <div className="mt-7 flex justify-center">
                <Button size="lg" onClick={() => window.dispatchEvent(new CustomEvent('footprints:import'))}>
                  导入第一张照片
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** 工具组容器：轻量玻璃胶囊，弱化存在感 */
function ControlGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto flex flex-col gap-0.5 rounded-full border border-line/[0.08] glass-soft p-1 shadow-marker">
      {children}
    </div>
  )
}

function MapControlBtn({
  children,
  onClick,
  label,
  active
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-line/[0.08] hover:text-fg active:scale-95',
        active && 'bg-accent/15 text-accent'
      )}
    >
      {children}
    </button>
  )
}

function FilterChip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full px-3.5 py-1 text-xs font-medium transition',
        active ? 'bg-fg text-bg' : 'text-muted hover:bg-line/[0.08] hover:text-fg'
      )}
    >
      {children}
    </button>
  )
}
