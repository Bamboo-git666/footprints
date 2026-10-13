import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin, Search } from 'lucide-react'
import { useApp } from '@/state/app'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { reverseGeocode, searchPlaces, type GeoSearchResult } from '@/lib/geocoder'

/** 城市指定草稿：选择结果后先暂存，点击「保存」才写库 */
interface CityDraft {
  city: string
  region: string | null
  country: string | null
  countryCode: string | null
  manual?: boolean
}

/**
 * 手动指定城市：为「待确认城市」照片搜索并绑定城市归属。
 * 仅接受能通过逆地理确认行政区划的结果，不编造城市信息。
 */
export function CityAssignDialog({ photoIds, onClose }: { photoIds: string[] | null; onClose: () => void }) {
  const app = useApp()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [applying, setApplying] = useState(false)
  const [draft, setDraft] = useState<CityDraft | null>(null)
  const timerRef = useRef(0)
  const open = photoIds !== null

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setSearching(false)
      setApplying(false)
      setDraft(null)
    }
  }, [open])

  // 关键词搜索（防抖，遵守 Nominatim 使用政策）
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      void searchPlaces(q).then((r) => {
        setResults(r)
        setSearching(false)
      })
    }, 550)
    return () => window.clearTimeout(timerRef.current)
  }, [query, open])

  // 选择搜索结果：先反查行政区划进入草稿，不直接写库
  const apply = async (r: GeoSearchResult) => {
    if (!photoIds?.length || applying) return
    setApplying(true)
    // 以选中点坐标反查行政区划，保证城市字段结构一致；查不到时明确失败，不猜测
    const geo = await reverseGeocode(r.lat, r.lng, undefined, { force: true })
    setApplying(false)
    if (!geo?.city) {
      app.toast('无法确认该位置的城市信息', '请换一个更具体的城市名重试', 'error')
      return
    }
    setDraft({ city: geo.city, region: geo.region, country: geo.country, countryCode: geo.countryCode })
  }

  // 离线兜底：地名服务不可用时，直接使用用户输入的城市名（不猜测省市，服务恢复后自动补全）
  const applyManual = () => {
    if (!photoIds?.length || applying) return
    const name = query.trim()
    if (name.length < 2) return
    const isCn = /[\u4e00-\u9fff]/.test(name)
    setDraft({ city: name, region: null, country: isCn ? '中国' : null, countryCode: isCn ? 'CN' : null, manual: true })
  }

  // 草稿确认：点击「保存」才写入数据库
  const confirmSave = async () => {
    if (!photoIds?.length || !draft || applying) return
    setApplying(true)
    await app.updatePhotos(photoIds, {
      city: draft.city,
      region: draft.region,
      country: draft.country,
      countryCode: draft.countryCode,
      // 标记为已处理，避免启动补偿的重试覆盖用户手动指定的城市
      geocodedAt: Date.now()
    })
    setApplying(false)
    app.toast('城市已保存', `${draft.city} · ${photoIds.length} 张照片已归组`, 'success')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`为 ${photoIds?.length ?? 0} 张照片指定城市`} className="sm:max-w-lg">
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-muted">
          搜索城市名并选择结果，所选照片将归入同一城市相册。原始 GPS 坐标不会改变。
        </p>
        <div className="flex items-center gap-2 rounded-xl border border-line/10 bg-bg/60 px-3 py-2">
          <Search size={15} className="shrink-0 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入城市名，如：深圳市、Kyoto…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
          />
          {searching && <Loader2 size={14} className="shrink-0 animate-spin text-muted" />}
        </div>
        {/* 草稿摘要：选择结果后先暂存，点击「保存」才生效 */}
        {draft && (
          <div className="rounded-2xl border border-accent/25 bg-accent/[0.07] px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-fg">
              <MapPin size={15} className="shrink-0 text-accent" />
              将把 {photoIds?.length ?? 0} 张照片归入「{draft.city}」
            </p>
            <p className="mt-1 pl-[23px] text-xs leading-relaxed text-muted">
              {draft.manual
                ? '手动指定的城市，省市信息将在地名服务可用后自动补全'
                : [draft.region, draft.country].filter(Boolean).join(' · ')}
              {' · '}点击「保存」后生效
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>重选</Button>
              <Button size="sm" onClick={() => void confirmSave()} disabled={applying}>
                {applying ? <Loader2 size={13} className="animate-spin" /> : null}
                保存
              </Button>
            </div>
          </div>
        )}
        <div className="scroll-area max-h-[46vh] space-y-1 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={`${r.lat}-${r.lng}-${i}`}
              type="button"
              disabled={applying}
              onClick={() => void apply(r)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-line/[0.06] disabled:opacity-50"
            >
              <MapPin size={14} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{r.label}</p>
                <p className="truncate text-[11px] text-faint">{r.detail}</p>
              </div>
              {applying && <Loader2 size={13} className="shrink-0 animate-spin text-muted" />}
            </button>
          ))}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="py-6 text-center text-xs text-faint">没有找到匹配的地点，请换个关键词，或使用下方手动指定。</p>
          )}
        </div>
        {/* 离线兜底：搜索依赖在线地名服务，不可用时允许直接使用输入的城市名 */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line/[0.08] bg-elevated/40 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-faint">
            搜索不到？可直接使用上面输入的城市名（离线可用，省份信息稍后自动补全）。
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={applying || query.trim().length < 2}
            onClick={() => void applyManual()}
          >
            {applying ? <Loader2 size={13} className="animate-spin" /> : null}
            直接指定
          </Button>
        </div>
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={onClose}>取消</Button>
        </div>
      </div>
    </Modal>
  )
}
