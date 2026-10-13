import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MapPin, Search, Sparkles } from 'lucide-react'
import { searchPlaces, type GeoSearchResult } from '@/lib/geocoder'
import { isLocated } from '@/lib/geo'
import { useApp } from '@/state/app'
import { ymd } from '@/lib/utils'

interface LocalEntry {
  key: string
  label: string
  detail: string
  photoIds: string[]
}

export function PlaceSearch({ onPicked }: { onPicked?: () => void }) {
  const app = useApp()
  const [q, setQ] = useState('')
  const [online, setOnline] = useState<GeoSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const local = useMemo<LocalEntry[]>(() => {
    const query = q.trim().toLowerCase()
    if (!query) return []
    const map = new Map<string, LocalEntry>()
    for (const p of app.photos) {
      const name = p.placeName || p.city
      const hay = [p.placeName, p.city, p.region, p.country, p.name].filter(Boolean).join(' ').toLowerCase()
      if (name && hay.includes(query)) {
        const key = name
        const entry = map.get(key) ?? { key, label: name, detail: [p.city, p.country].filter(Boolean).join(' · ') || '我的照片', photoIds: [] }
        entry.photoIds.push(p.id)
        map.set(key, entry)
      }
    }
    return Array.from(map.values()).slice(0, 5)
  }, [q, app.photos])

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) {
      abortRef.current?.abort()
      setOnline([])
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(() => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      void searchPlaces(q, ctrl.signal).then((r) => {
        if (ctrl.signal.aborted) return
        setOnline(r)
        setLoading(false)
      }).catch(() => {
        if (!ctrl.signal.aborted) {
          setOnline([])
          setLoading(false)
        }
      })
    }, 450)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setFocused(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const openLocal = (entry: LocalEntry) => {
    const points = entry.photoIds
      .map((id) => app.photoMap.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .filter(isLocated)
    if (points.length > 0) app.mapCtl.current?.fitPhotoPoints(points)
    app.openAlbum(entry.photoIds)
    setFocused(false)
    setQ('')
    onPicked?.()
  }

  const openOnline = (r: GeoSearchResult) => {
    app.mapCtl.current?.flyTo(r.lng, r.lat, 13)
    setFocused(false)
    setQ('')
    onPicked?.()
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex h-10 items-center gap-2 rounded-full border border-line/10 panel-glass px-4 transition focus-within:border-accent/40">
        {loading ? <Loader2 size={15} className="shrink-0 animate-spin text-faint" /> : <Search size={15} className="shrink-0 text-faint" />}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="搜索城市、国家或我的地点"
          className="w-full bg-transparent text-sm text-fg placeholder:text-faint outline-none"
        />
      </div>

      {focused && q.trim().length >= 2 && (
        <div className="scroll-area absolute left-0 right-0 z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-3xl border border-line/10 bg-elevated/95 p-1.5 shadow-float backdrop-blur-xl">
          {local.map((e) => (
            <button
              key={e.key}
              type="button"
              onClick={() => openLocal(e)}
              className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition hover:bg-line/[0.06]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <MapPin size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-fg">{e.label}</span>
                  <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-px text-[10px] text-accent">{e.photoIds.length} 张</span>
                </span>
                <span className="block truncate text-xs text-muted">{e.detail}</span>
              </span>
            </button>
          ))}

          {online.map((r, i) => (
            <button
              key={`${r.lat},${r.lng}-${i}`}
              type="button"
              onClick={() => openOnline(r)}
              className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition hover:bg-line/[0.06]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line/[0.07] text-muted">
                <Sparkles size={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{r.label}</span>
                <span className="block truncate text-xs text-muted">{r.detail}</span>
              </span>
            </button>
          ))}

          {!loading && local.length === 0 && online.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-muted">没有找到匹配的地点</p>
          )}
          {loading && local.length === 0 && online.length === 0 && (
            <p className="flex items-center gap-2 px-4 py-6 text-xs text-muted">
              <Loader2 size={13} className="animate-spin text-accent" /> 正在搜索地点…
            </p>
          )}
        </div>
      )}

      {focused && q.trim().length < 2 && app.photos.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-2 rounded-3xl border border-line/10 bg-elevated/95 px-4 py-4 shadow-float backdrop-blur-xl">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">快速跳转</p>
          <div className="flex flex-wrap gap-1.5">
            {app.years.slice(0, 6).map((y) => (
              <button
                key={y}
                onClick={() => { app.setYear(y); setFocused(false); setQ(''); onPicked?.() }}
                className="rounded-full border border-line/10 px-3 py-1 text-xs text-muted hover:border-accent/40 hover:text-fg"
              >
                {y} 年
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            最近的足迹：{[...new Set(app.photos.map((p) => ymd(p.takenAt).year))].sort((a, b) => b - a).slice(0, 3).join(' · ')}
          </p>
        </div>
      )}
    </div>
  )
}
