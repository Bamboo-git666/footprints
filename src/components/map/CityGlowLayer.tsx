import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MLMap, GeoJSONSource } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { adcodeOf, loadCityBoundary, scatterStarPoints } from '@/lib/city-boundaries'

const SOURCE_ID = 'city-glow'
const FILL_ID = 'city-glow-fill'
const LINE_ID = 'city-glow-line'
const STAR_PREFIX = 'city-glow-star-'
/** 闪烁分组数：各组相位错开，每帧只更新组级 opacity，性能友好 */
const GROUPS = 10
/** 每座城市撒点数量 */
const STARS_PER_CITY = 150

const GEOMETRY_IS_POLYGON = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false] as never
const GEOMETRY_IS_POINT = ['==', ['geometry-type'], 'Point'] as never

/**
 * 点亮城市区域（满天星）：已点亮城市的行政区划内撒上随机星点，
 * 分组错相位闪烁如星空；边界以极淡的金色填充与描边作底。
 * 边界按需异步加载，加载失败静默；主题切换重建样式后自动重新挂载。
 */
export function CityGlowLayer({
  map,
  cities
}: {
  map: MLMap
  cities: { key: string; city: string; region: string | null }[]
}) {
  const [data, setData] = useState<FeatureCollection | null>(null)
  const requestedRef = useRef(new Set<number>())
  const dataRef = useRef(data)
  dataRef.current = data
  const retryRef = useRef(0)

  // 稳定的 cities 摘要，避免 photos 任意变更触发重复请求
  const summary = useMemo(() => cities.map((c) => `${c.key}:${c.city}`).sort().join('|'), [cities])

  // 为新点亮的城市加载边界并撒星点
  useEffect(() => {
    let alive = true
    for (const c of cities) {
      const ad = adcodeOf(c.city, c.region)
      if (ad === null) {
        console.warn('[footprints] 城市名未匹配到行政区划，区域不点亮:', c.city)
        continue
      }
      if (requestedRef.current.has(ad)) continue
      requestedRef.current.add(ad)
      void loadCityBoundary(ad).then((fc) => {
        if (!alive || !fc) return
        setData((prev) => {
          const kept = (prev?.features ?? []).filter((f) => f.properties?.ad !== ad)
          const polygons = fc.features.map((f) => ({ ...f, properties: { ...f.properties, ad } }))
          const stars = scatterStarPoints(fc, STARS_PER_CITY, GROUPS).map((s) => ({
            ...s,
            properties: { ...s.properties, ad }
          }))
          return { type: 'FeatureCollection', features: [...kept, ...polygons, ...stars] }
        })
      })
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary])

  /** 把当前数据写入地图（边界 fill/line + 分组星点 circle 层，置于地名标注之下） */
  const apply = useCallback(() => {
    if (!map.getStyle()) return
    const d = dataRef.current
    if (!d || d.features.length === 0) return
    const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
    if (src) {
      src.setData(d)
      return
    }
    if (!map.isStyleLoaded()) {
      // 样式刚重建（主题切换 / 首次加载）资源未就绪，等地图空闲后重试（有上限防循环）
      if (retryRef.current < 5) {
        retryRef.current++
        map.once('idle', () => apply())
      }
      return
    }
    retryRef.current = 0
    const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id
    map.addSource(SOURCE_ID, { type: 'geojson', data: d })
    map.addLayer(
      {
        id: FILL_ID,
        type: 'fill',
        source: SOURCE_ID,
        filter: GEOMETRY_IS_POLYGON,
        paint: { 'fill-color': '#e9a84c', 'fill-opacity': 0.06 }
      },
      firstSymbol
    )
    map.addLayer(
      {
        id: LINE_ID,
        type: 'line',
        source: SOURCE_ID,
        filter: GEOMETRY_IS_POLYGON,
        paint: { 'line-color': '#e9a84c', 'line-opacity': 0.16, 'line-width': 1 }
      },
      firstSymbol
    )
    for (let i = 0; i < GROUPS; i++) {
      map.addLayer(
        {
          id: `${STAR_PREFIX}${i}`,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['all', GEOMETRY_IS_POINT, ['==', ['get', 'g'], i]] as never,
          paint: {
            'circle-color': i % 3 === 0 ? '#fdf2d5' : '#f6d997',
            'circle-blur': 0.36,
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              1.5,
              ['*', 0.7, ['get', 'r']],
              4,
              ['*', 1.15, ['get', 'r']],
              9,
              ['*', 1.7, ['get', 'r']]
            ]
          }
        },
        firstSymbol
      )
    }
  }, [map])

  // 数据就绪或样式（重）加载后都尝试挂载；首次样式未就绪时靠 load / style.load 重试
  useEffect(() => {
    apply()
    const onLoad = () => {
      retryRef.current = 0
      apply()
    }
    map.on('load', onLoad)
    map.on('style.load', onLoad)
    return () => {
      map.off('load', onLoad)
      map.off('style.load', onLoad)
    }
  }, [apply, data])

  // 星星闪烁：requestAnimationFrame 逐帧调制各组透明度（正弦 + 错相）
  useEffect(() => {
    const hasStars = !!data?.features.some((f) => f.geometry.type === 'Point')
    if (!hasStars) return
    let raf = 0
    const loop = () => {
      const t = performance.now() / 1000
      for (let i = 0; i < GROUPS; i++) {
        if (!map.getLayer(`${STAR_PREFIX}${i}`)) continue
        const tw = 0.5 + 0.5 * Math.sin(t * 1.35 + (i / GROUPS) * Math.PI * 2)
        map.setPaintProperty(`${STAR_PREFIX}${i}`, 'circle-opacity', 0.06 + 0.5 * tw)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [map, data])

  return null
}
