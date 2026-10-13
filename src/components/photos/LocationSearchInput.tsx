import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin, Search } from 'lucide-react'
import { searchPlaces, type GeoSearchResult } from '@/lib/geocoder'

export function LocationSearchInput({
  onPick,
  placeholder = '搜索城市、国家或地点…',
  autoFocus = true
}: {
  onPick: (r: GeoSearchResult) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<GeoSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(() => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      void searchPlaces(q, ctrl.signal).then((r) => {
        if (!ctrl.signal.aborted) {
          setResults(r)
          setLoading(false)
          setOpen(true)
        }
      })
    }, 450)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-2xl border border-line/10 bg-elevated/70 px-4 py-2.5 focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15">
        {loading ? <Loader2 size={16} className="shrink-0 animate-spin text-faint" /> : <Search size={16} className="shrink-0 text-faint" />}
        <input
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-fg placeholder:text-faint outline-none"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-line/10 bg-elevated shadow-float scroll-area">
          {results.map((r, i) => (
            <button
              key={`${r.lat},${r.lng}-${i}`}
              type="button"
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-line/[0.06]"
              onClick={() => {
                onPick(r)
                setOpen(false)
                setQ('')
              }}
            >
              <MapPin size={16} className="mt-0.5 shrink-0 text-accent" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-fg">{r.label}</span>
                <span className="block truncate text-xs text-muted">{r.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && q.trim().length >= 2 && results.length === 0 && (
        <div className="absolute z-40 mt-2 w-full rounded-2xl border border-line/10 bg-elevated px-4 py-3 text-xs text-muted shadow-float">
          未找到匹配地点，也可以直接在地图上点击选择。
        </div>
      )}
    </div>
  )
}
