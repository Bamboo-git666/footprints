import { useEffect, useState } from 'react'
import { Crosshair, MapPin, Search } from 'lucide-react'
import { useApp } from '@/state/app'
import { reverseGeocode, type GeoSearchResult } from '@/lib/geocoder'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { LocationSearchInput } from './LocationSearchInput'
import { toLocalInputValue } from '@/lib/utils'

interface FormState {
  name: string
  note: string
  takenAt: string
  lat: number | null
  lng: number | null
  placeName: string
  city: string
  region: string
  country: string
  countryCode: string
  journeyId: string
}

export function PhotoEditorDialog() {
  const app = useApp()
  const photo = app.editingId ? app.photoMap.get(app.editingId) ?? null : null
  const [form, setForm] = useState<FormState | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [saving, setSaving] = useState(false)
  // 搜索定位的结果只进草稿，标记是否需要随保存写入地理编码时间戳
  const [geoPicked, setGeoPicked] = useState(false)

  useEffect(() => {
    if (photo) {
      setForm({
        name: photo.name ?? '',
        note: photo.note ?? '',
        takenAt: toLocalInputValue(photo.takenAt),
        lat: photo.lat,
        lng: photo.lng,
        placeName: photo.placeName ?? '',
        city: photo.city ?? '',
        region: photo.region ?? '',
        country: photo.country ?? '',
        countryCode: photo.countryCode ?? '',
        journeyId: photo.journeyId ?? ''
      })
      setShowSearch(false)
      setGeoPicked(false)
    }
  }, [photo?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!photo || !form) {
    return <Modal open={!!app.editingId && !photo} onClose={app.closeEditor} title="编辑照片"><p className="text-sm text-muted">照片不存在或已删除。</p></Modal>
  }

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f))

  const save = async () => {
    setSaving(true)
    const hasCoord = form.lat !== null && form.lng !== null
    await app.updatePhoto(photo.id, {
      name: form.name.trim() || null,
      note: form.note.trim() || null,
      takenAt: new Date(form.takenAt).getTime() || photo.takenAt,
      // 坐标只在已存在/新选点时写入，未定位照片保持 pending 不被误标
      ...(hasCoord ? { lat: form.lat as number, lng: form.lng as number, locationStatus: 'located' as const } : {}),
      placeName: form.placeName.trim() || null,
      city: form.city.trim() || null,
      region: form.region.trim() || null,
      country: form.country.trim() || null,
      countryCode: form.countryCode.trim() || null,
      journeyId: form.journeyId || null,
      ...(geoPicked ? { geocodedAt: Date.now() } : {})
    })
    setSaving(false)
    app.closeEditor()
    app.toast('照片信息已更新', undefined, 'success')
  }

  // 搜索定位：仅填充表单草稿，点击「保存」后统一提交
  const pickFromSearch = async (r: GeoSearchResult) => {
    set({ lat: r.lat, lng: r.lng })
    const geo = await reverseGeocode(r.lat, r.lng)
    if (!geo) return
    setGeoPicked(true)
    set({
      placeName: geo.placeName,
      city: geo.city ?? '',
      region: geo.region ?? '',
      country: geo.country ?? '',
      countryCode: geo.countryCode ?? ''
    })
  }

  return (
    <Modal open={!!app.editingId} onClose={app.closeEditor} title="编辑照片">
      <div className="space-y-5">
        <div>
          <Label>标题</Label>
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="给这张照片起个名字" />
        </div>
        <div>
          <Label>备注</Label>
          <Textarea rows={3} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="记录当时的故事…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>拍摄时间</Label>
            <Input type="datetime-local" value={form.takenAt} onChange={(e) => set({ takenAt: e.target.value })} />
          </div>
          <div>
            <Label>所属旅行</Label>
            <select
              value={form.journeyId}
              onChange={(e) => set({ journeyId: e.target.value })}
              className="h-[42px] w-full rounded-2xl border border-line/10 bg-elevated/70 px-3 text-sm text-fg outline-none focus:border-accent/50"
            >
              <option value="">不属于任何旅行</option>
              {app.journeys.map((j) => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-line/10 bg-elevated/40 p-4">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
            <MapPin size={12} /> 位置信息
          </p>
          {form.lat !== null && form.lng !== null ? (
            <p className="mb-1.5 font-mono text-xs text-faint">{form.lat.toFixed(6)}, {form.lng.toFixed(6)}</p>
          ) : (
            <p className="mb-1.5 text-xs text-danger">这张照片还没有位置信息</p>
          )}
          {(form.lat !== photo.lat || form.lng !== photo.lng) && (
            <p className="mb-2 text-xs text-accent">新位置将在点击「保存」后生效</p>
          )}
          <div className="mb-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => { app.closeEditor(); app.startPicking([photo.id]) }}>
              <Crosshair size={14} /> 在地图上选点
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowSearch((v) => !v)}>
              <Search size={14} /> 搜索定位
            </Button>
          </div>
          {showSearch && (
            <div className="mb-3">
              <LocationSearchInput onPick={pickFromSearch} placeholder="搜索这张照片的拍摄地点…" />
            </div>
          )}
          <div className="space-y-3">
            <div>
              <Label>地点名称</Label>
              <Input value={form.placeName} onChange={(e) => set({ placeName: e.target.value })} placeholder="手动填写" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>城市</Label>
                <Input value={form.city} onChange={(e) => set({ city: e.target.value })} />
              </div>
              <div>
                <Label>国家 / 地区</Label>
                <Input value={form.country} onChange={(e) => set({ country: e.target.value })} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-1">
          <Button variant="danger" onClick={() => void app.deletePhoto(photo.id)}>删除照片</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={app.closeEditor}>取消</Button>
            <Button onClick={save} disabled={saving}>保存</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
