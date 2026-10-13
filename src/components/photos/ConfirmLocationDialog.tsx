import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, MapPin, Search } from 'lucide-react'
import { useApp } from '@/state/app'
import { reverseGeocode, type GeoSearchResult } from '@/lib/geocoder'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { LocationSearchInput } from './LocationSearchInput'
import { useBlobUrl } from '@/hooks/useBlobUrl'

function MiniThumb({ id }: { id: string }) {
  const url = useBlobUrl(id, 'thumb')
  return url ? (
    <img src={url} alt="" className="h-10 w-10 rounded-lg object-cover" />
  ) : (
    <div className="h-10 w-10 animate-pulse rounded-lg bg-line/10" />
  )
}

export function ConfirmLocationDialog() {
  const app = useApp()
  const pick = app.locationPick

  const [lat, setLat] = useState(0)
  const [lng, setLng] = useState(0)
  const [placeName, setPlaceName] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [country, setCountry] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [resolving, setResolving] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => {
    if (!pick) return
    setLat(pick.lat)
    setLng(pick.lng)
    setPlaceName('')
    setCity('')
    setRegion('')
    setCountry('')
    setCountryCode('')
    setShowSearch(false)
    setResolving(true)
    let alive = true
    void reverseGeocode(pick.lat, pick.lng).then((geo) => {
      if (!alive) return
      setResolving(false)
      if (geo) {
        setPlaceName(geo.placeName)
        setCity(geo.city ?? '')
        setRegion(geo.region ?? '')
        setCountry(geo.country ?? '')
        setCountryCode(geo.countryCode ?? '')
      }
    })
    return () => {
      alive = false
    }
  }, [pick])

  const applySearchResult = (r: GeoSearchResult) => {
    setLat(r.lat)
    setLng(r.lng)
    setResolving(true)
    void reverseGeocode(r.lat, r.lng).then((geo) => {
      setResolving(false)
      if (geo) {
        setPlaceName(geo.placeName)
        setCity(geo.city ?? '')
        setRegion(geo.region ?? '')
        setCountry(geo.country ?? '')
        setCountryCode(geo.countryCode ?? '')
      }
    })
  }

  return (
    <Modal open={!!pick} onClose={app.cancelLocationPick} title="确认拍摄位置">
      {pick && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {pick.photoIds.slice(0, 4).map((id) => (
                <div key={id} className="rounded-lg ring-2 ring-surface">
                  <MiniThumb id={id} />
                </div>
              ))}
            </div>
            <p className="text-sm text-muted">将为 <span className="font-semibold text-fg">{pick.photoIds.length}</span> 张照片设置此位置</p>
          </div>

          <div>
            <Button variant="secondary" size="sm" onClick={() => setShowSearch((v) => !v)}>
              <Search size={14} /> 改为搜索定位
            </Button>
            {showSearch && <div className="mt-3"><LocationSearchInput onPick={applySearchResult} placeholder="搜索精确地点…" autoFocus /></div>}
          </div>

          <div className="rounded-2xl border border-accent/25 bg-accent/[0.07] px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-fg">
              <MapPin size={15} className="text-accent" />
              {lat.toFixed(6)}, {lng.toFixed(6)}
            </p>
            <p className="mt-1 text-xs text-muted">精确坐标已记录，统计与聚合都基于它。</p>
          </div>

          <div className="space-y-3">
            {resolving ? (
              <p className="flex items-center gap-2 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" /> 正在识别附近的地名（可直接编辑）…
              </p>
            ) : (
              <p className="flex items-center gap-2 text-xs text-muted">
                <CheckCircle2 size={13} className="text-accent" /> 可修改识别结果，或留空仅保存坐标
              </p>
            )}
            <div>
              <Label>地点名称</Label>
              <Input value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="例如：外滩 · 中山东一路" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>城市</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="未知也可以留空" />
              </div>
              <div>
                <Label>省 / 州</Label>
                <Input value={region} onChange={(e) => setRegion(e.target.value)} />
              </div>
              <div>
                <Label>国家 / 地区</Label>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
              <div>
                <Label>国家代码</Label>
                <Input value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} placeholder="CN" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={app.cancelLocationPick}>取消</Button>
            <Button
              onClick={() => {
                const name = placeName.trim()
                void app.applyLocation(
                  pick.photoIds,
                  lat,
                  lng,
                  name
                    ? {
                        placeName: name,
                        city: city.trim() || null,
                        region: region.trim() || null,
                        country: country.trim() || null,
                        countryCode: countryCode.trim() || null
                      }
                    : null
                )
              }}
            >
              保存位置
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
