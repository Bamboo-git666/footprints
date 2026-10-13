import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, Wand2 } from 'lucide-react'
import type { Journey } from '@/types'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useApp } from '@/state/app'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { ymd, cn } from '@/lib/utils'

interface Draft {
  name: string
  description: string
  startDate: string
  endDate: string
  coverPhotoId: string | null
  photoIds: string[]
}

function emptyDraft(): Draft {
  return { name: '', description: '', startDate: '', endDate: '', coverPhotoId: null, photoIds: [] }
}

function dateInput(ts: number | null): string {
  if (!ts) return ''
  const { year, month, day } = ymd(ts)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function PickerThumb({
  id,
  selected,
  onMouseDown,
  onMouseEnter,
  onClick
}: {
  id: string
  selected: boolean
  onMouseDown: (e: ReactMouseEvent) => void
  onMouseEnter: (e: ReactMouseEvent) => void
  onClick: (e: ReactMouseEvent) => void
}) {
  const url = useBlobUrl(id, 'thumb')
  return (
    <button
      type="button"
      draggable={false}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        'relative aspect-square overflow-hidden rounded-xl border-2 transition select-none',
        selected ? 'border-accent ring-2 ring-accent/25' : 'border-transparent hover:border-line/30'
      )}
    >
      {url ? (
        <img src={url} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-line/10" />
      )}
    </button>
  )
}

/** 外部预填草稿（智能推荐审核时使用） */
export interface JourneyPreset {
  name: string
  description?: string
  startDate: number | null
  endDate: number | null
  photoIds: string[]
}

export function JourneyEditorDialog({
  open,
  journey,
  preset,
  title,
  onClose
}: {
  open: boolean
  journey: Journey | null
  preset?: JourneyPreset | null
  title?: string
  onClose: () => void
}) {
  const app = useApp()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (journey) {
      setDraft({
        name: journey.name,
        description: journey.description ?? '',
        startDate: dateInput(journey.startDate),
        endDate: dateInput(journey.endDate),
        coverPhotoId: journey.coverPhotoId,
        photoIds: journey.photoIds
      })
    } else if (preset) {
      setDraft({
        name: preset.name,
        description: preset.description ?? '',
        startDate: dateInput(preset.startDate),
        endDate: dateInput(preset.endDate),
        coverPhotoId: null,
        photoIds: preset.photoIds
      })
    } else {
      setDraft(emptyDraft())
    }
  }, [open, journey, preset])

  const allPhotos = useMemo(() => app.photos.slice().sort((a, b) => b.takenAt - a.takenAt), [app.photos])
  const selectedPhotos = useMemo(
    () => draft.photoIds.flatMap((id) => app.photoMap.get(id) ?? []),
    [draft.photoIds, app.photoMap]
  )

  const togglePhoto = (id: string) =>
    setDraft((d) => {
      const has = d.photoIds.includes(id)
      const photoIds = has ? d.photoIds.filter((x) => x !== id) : [...d.photoIds, id]
      const coverPhotoId = d.coverPhotoId && !has ? d.coverPhotoId : has && d.coverPhotoId === id ? null : d.coverPhotoId
      return { ...d, photoIds, coverPhotoId }
    })

  // ---- 快捷多选 ----
  // 1) 按住左键滑动刷选：以按下时第一张照片的状态取反，滑过的都应用同一操作
  // 2) Shift 点击：从上次点击的照片到本次之间全部选中
  const dragRef = useRef({ active: false, moved: false, add: true })
  const lastClickedRef = useRef<string | null>(null)

  // 松开左键结束刷选；刷选过则抑制随后触发的 click，避免与单张 toggle 冲突
  useEffect(() => {
    if (!open) return
    const up = () => {
      dragRef.current.active = false
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [open])

  const applyBrush = (id: string, add: boolean) =>
    setDraft((d) => {
      const has = d.photoIds.includes(id)
      if (add === has) return d
      const photoIds = add ? [...d.photoIds, id] : d.photoIds.filter((x) => x !== id)
      const coverPhotoId = add ? d.coverPhotoId : d.coverPhotoId === id ? null : d.coverPhotoId
      return { ...d, photoIds, coverPhotoId }
    })

  const onThumbMouseDown = (id: string) => (e: ReactMouseEvent) => {
    if (e.button !== 0) return
    const add = !draft.photoIds.includes(id)
    dragRef.current = { active: true, moved: false, add }
    applyBrush(id, add)
  }

  const onThumbMouseEnter = (id: string) => (e: ReactMouseEvent) => {
    const drag = dragRef.current
    if (!drag.active || e.buttons !== 1) return
    drag.moved = true
    applyBrush(id, drag.add)
  }

  const onThumbClick = (id: string) => (e: ReactMouseEvent) => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false
      return
    }
    if (e.shiftKey) {
      const ids = allPhotos.map((p) => p.id)
      const from = lastClickedRef.current ? ids.indexOf(lastClickedRef.current) : -1
      const to = ids.indexOf(id)
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from]
        const range = ids.slice(lo, hi + 1)
        setDraft((d) => ({ ...d, photoIds: Array.from(new Set([...d.photoIds, ...range])) }))
      }
      lastClickedRef.current = id
      return
    }
    lastClickedRef.current = id
    togglePhoto(id)
  }

  const selectAllPhotos = () => setDraft((d) => ({ ...d, photoIds: allPhotos.map((p) => p.id) }))
  const invertSelection = () =>
    setDraft((d) => ({
      ...d,
      photoIds: allPhotos.map((p) => p.id).filter((id) => !d.photoIds.includes(id))
    }))

  const autoDates = () => {
    if (selectedPhotos.length === 0) return
    const times = selectedPhotos.map((p) => p.takenAt)
    setDraft((d) => ({ ...d, startDate: dateInput(Math.min(...times)), endDate: dateInput(Math.max(...times)) }))
  }

  const save = async () => {
    if (!draft.name.trim()) return
    setSaving(true)
    await app.saveJourney({
      id: journey?.id,
      name: draft.name.trim(),
      description: draft.description.trim(),
      startDate: draft.startDate ? new Date(draft.startDate + 'T12:00').getTime() : null,
      endDate: draft.endDate ? new Date(draft.endDate + 'T12:00').getTime() : null,
      coverPhotoId: draft.coverPhotoId,
      photoIds: draft.photoIds
    })
    setSaving(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={title ?? (journey ? '编辑旅行' : '新建旅行')} className="sm:max-w-2xl">
      <div className="space-y-5">
        <div>
          <Label>旅行名称</Label>
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例如：2026 新加坡之旅" autoFocus />
        </div>
        <div>
          <Label>简短描述</Label>
          <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="这趟旅行的主题或心情…" />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="mb-0">起止日期</Label>
            <button type="button" onClick={autoDates} className="flex items-center gap-1 text-xs text-accent">
              <Wand2 size={12} /> 根据所选照片填充
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
            <span className="text-faint">–</span>
            <Input type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
          </div>
        </div>

        {selectedPhotos.length > 0 && (
          <div>
            <Label>封面照片</Label>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {selectedPhotos
                .slice()
                .sort((a, b) => a.takenAt - b.takenAt)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDraft({ ...draft, coverPhotoId: draft.coverPhotoId === p.id ? null : p.id })}
                    className={cn(
                      'relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2',
                      draft.coverPhotoId === p.id ? 'border-accent' : 'border-transparent opacity-70'
                    )}
                  >
                    <CoverThumb id={p.id} />
                  </button>
                ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="mb-0">包含的照片 · {draft.photoIds.length}</Label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={selectAllPhotos} className="text-xs text-faint hover:text-fg">
                全选
              </button>
              <button type="button" onClick={invertSelection} className="text-xs text-faint hover:text-fg">
                反选
              </button>
              {draft.photoIds.length > 0 && (
                <button type="button" onClick={() => setDraft({ ...draft, photoIds: [], coverPhotoId: null })} className="text-xs text-faint hover:text-fg">
                  清空
                </button>
              )}
            </div>
          </div>
          {allPhotos.length === 0 ? (
            <p className="flex items-center gap-2 rounded-2xl border border-dashed border-line/15 px-4 py-6 text-sm text-muted">
              <CalendarClock size={16} /> 请先导入照片，再把它们编入旅行。
            </p>
          ) : (
            <div className="scroll-area grid max-h-64 grid-cols-4 gap-2 overflow-y-auto rounded-2xl border border-line/[0.07] bg-elevated/30 p-2.5 sm:grid-cols-6">
              {allPhotos.map((p) => (
                <PickerThumb
                  key={p.id}
                  id={p.id}
                  selected={draft.photoIds.includes(p.id)}
                  onMouseDown={onThumbMouseDown(p.id)}
                  onMouseEnter={onThumbMouseEnter(p.id)}
                  onClick={onThumbClick(p.id)}
                />
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-faint">点击选择 · 按住左键滑动批量选择（反向滑动可取消）· Shift 点击选区间</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={!draft.name.trim() || saving}>保存旅行</Button>
        </div>
      </div>
    </Modal>
  )
}

function CoverThumb({ id }: { id: string }) {
  const url = useBlobUrl(id, 'thumb')
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-line/10" />
}
