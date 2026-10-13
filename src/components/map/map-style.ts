import type { StyleSpecification, LayerSpecification, SkySpecification } from 'maplibre-gl'
import type { ResolvedTheme } from '@/hooks/useTheme'

// OpenFreeMap 矢量底图（OpenMapTiles / OSM 数据），免费且无需 API key。
// 深色主题用 dark，浅色主题用 positron，均由 tiles.openfreemap.org 托管样式 JSON。
const DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'
const LIGHT_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

/**
 * 对官方样式做轻量「编辑制图」改造，让照片标记成为视觉中心：
 * 1. 地名标注优先中文（name:zh-Hans → name:zh → name）
 * 2. 弱化非必要道路与行政边界（降低透明度 / 提高次要要素 minzoom）
 * 3. 降低次要标注密度（POI、道路名、小区标签延后出现）
 * 拉取或转换失败时回退为官方样式 URL，不影响可用性。
 */

function layerTextUsesName(layer: LayerSpecification): boolean {
  if (layer.type !== 'symbol') return false
  const tf = (layer.layout as GeoJSONSymbolLayout | undefined)?.['text-field']
  if (tf === undefined) return false
  const s = typeof tf === 'string' ? tf : JSON.stringify(tf)
  return s.includes('name')
}

interface GeoJSONSymbolLayout {
  'text-field'?: unknown
  [k: string]: unknown
}

function layerFilterMentions(filter: unknown, tokens: string[]): boolean {
  const s = JSON.stringify(filter ?? '')
  return tokens.some((t) => s.includes(`"${t}"`))
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback
}

/**
 * Globe 大气 / 天空：克制的层次感，不堆特效。
 * 深色主题为近黑深空 + 冷灰地平线，atmosphere 压低避免边缘光过亮；
 * 浅色主题为柔和浅蓝 + 暖白过渡。
 */
export function mapSky(theme: ResolvedTheme): SkySpecification {
  return theme === 'dark'
    ? {
        'sky-color': '#04060b',
        'horizon-color': '#121c29',
        'fog-color': '#090d14',
        'sky-horizon-blend': 0.5,
        'horizon-fog-blend': 0.55,
        'fog-ground-blend': 0.62,
        'atmosphere-blend': 0.38
      }
    : {
        'sky-color': '#dbe6f4',
        'horizon-color': '#f0e9db',
        'fog-color': '#edeff2',
        'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.6,
        'fog-ground-blend': 0.6,
        'atmosphere-blend': 0.45
      }
}

function transformStyle(style: StyleSpecification, theme: ResolvedTheme): StyleSpecification {
  const roadFade = theme === 'dark' ? 0.55 : 0.62
  const boundaryFade = theme === 'dark' ? 0.5 : 0.55
  const zhName: unknown = ['coalesce', ['get', 'name:zh-Hans'], ['get', 'name:zh'], ['get', 'name']]

  const layers = style.layers.map((layer) => {
    const l = { ...layer } as LayerSpecification & { minzoom?: number }
    const sourceLayer = 'source-layer' in l ? (l as { 'source-layer'?: string })['source-layer'] : undefined

    // ---- 球体深度：深色下海陆冷暖分离、压暗建筑（浅色 positron 保持纸感）----
    if (theme === 'dark') {
      if (l.type === 'background') {
        l.paint = { ...(l.paint as Record<string, unknown>), 'background-color': '#0a0e15' } as typeof l.paint
      } else if (l.type === 'fill' && sourceLayer === 'water') {
        const paint = { ...((l.paint as Record<string, unknown>) ?? {}) }
        paint['fill-color'] = '#0b1524'
        l.paint = paint as typeof l.paint
      } else if (l.type === 'fill' && (sourceLayer === 'building' || sourceLayer === 'building-top')) {
        const paint = { ...((l.paint as Record<string, unknown>) ?? {}) }
        const cur = numOr(paint['fill-opacity'], 1)
        paint['fill-opacity'] = Math.min(cur, 0.42)
        l.paint = paint as typeof l.paint
      }
    }

    // ---- 地名优先中文（跳过道路编号等非 name 标注）----
    if (layerTextUsesName(layer)) {
      l.layout = { ...l.layout, 'text-field': zhName } as typeof l.layout
    }

    // ---- 城市 / 国家地名提亮：深色背景下保证辨识度（配深色 halo 增强可读）----
    if (
      theme === 'dark' &&
      l.type === 'symbol' &&
      (l as { 'source-layer'?: string })['source-layer'] === 'place'
    ) {
      const paint = { ...((l.paint as Record<string, unknown>) ?? {}) }
      paint['text-color'] = '#ccd3dd'
      paint['text-halo-color'] = '#0a0b0d'
      paint['text-halo-width'] = 1.2
      l.paint = paint as typeof l.paint
    }

    // ---- 道路降噪 ----
    if (l.type === 'line' && 'source-layer' in l && (l as { 'source-layer'?: string })['source-layer'] === 'transportation') {
      const paint = { ...((l.paint as Record<string, unknown>) ?? {}) }
      const cur = numOr(paint['line-opacity'], 1)
      paint['line-opacity'] = Math.max(0.18, cur * roadFade)
      l.paint = paint as typeof l.paint
      const mentions = (t: string[]) => layerFilterMentions(l.filter, t)
      // 低等级道路延后出现，减少小比例尺下的视觉噪声
      if (mentions(['path', 'track', 'service', 'pedestrian'])) l.minzoom = Math.max(l.minzoom ?? 0, 15)
      else if (mentions(['minor'])) l.minzoom = Math.max(l.minzoom ?? 0, 12.5)
    }

    // ---- 行政边界弱化 ----
    if (l.type === 'line' && sourceLayer === 'boundary') {
      const paint = { ...((l.paint as Record<string, unknown>) ?? {}) }
      const cur = numOr(paint['line-opacity'], 1)
      paint['line-opacity'] = Math.min(cur, boundaryFade)
      l.paint = paint as typeof l.paint
    }

    // ---- 标注密度控制：缩放越低标签越少，聚焦球体本身 ----
    if (l.type === 'symbol') {
      if (sourceLayer === 'poi') l.minzoom = Math.max(l.minzoom ?? 0, (l.minzoom ?? 0) + 1.5)
      else if (sourceLayer === 'transportation_name') l.minzoom = Math.max(l.minzoom ?? 0, (l.minzoom ?? 0) + 1)
      else if (sourceLayer === 'place') {
        if (layerFilterMentions(l.filter, ['suburb', 'neighbourhood', 'quarter'])) {
          l.minzoom = Math.max(l.minzoom ?? 0, 12)
        } else if (layerFilterMentions(l.filter, ['hamlet', 'village'])) {
          l.minzoom = Math.max(l.minzoom ?? 0, 9.5)
        } else if (layerFilterMentions(l.filter, ['town'])) {
          l.minzoom = Math.max(l.minzoom ?? 0, 8)
        }
      }
    }

    return l
  })

  // 全球视角呈现 3D 地球；放大时由引擎自动平滑过渡为平面地图，缩回后恢复球体
  return { ...style, layers, projection: { type: 'globe' }, sky: mapSky(theme) }
}

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

// 模块级缓存：每个主题只拉取/转换一次
const cache = new Map<ResolvedTheme, Promise<StyleSpecification | string>>()

export function loadMapStyle(theme: ResolvedTheme): Promise<StyleSpecification | string> {
  const hit = cache.get(theme)
  if (hit) return hit

  const url = theme === 'dark' ? DARK_STYLE_URL : LIGHT_STYLE_URL
  const task = fetchWithTimeout(url, 6000)
    .then((res) => {
      if (!res.ok) throw new Error(`样式拉取失败 ${res.status}`)
      return res.json() as Promise<StyleSpecification>
    })
    .then((style) => transformStyle(style, theme))
    .catch(() => url) // 失败回退：直接用官方样式 URL

  cache.set(theme, task)
  return task
}
