import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Crosshair, MapPinOff, Square, Trash2 } from 'lucide-react'
import { useApp } from '@/state/app'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { formatDate } from '@/lib/utils'
import { CityAssignDialog } from './CityAssignDialog'

export const PENDING_EVENT = 'footprints:pending'

function RowThumb({ id }: { id: string }) {
  const url = useBlobUrl(id, 'thumb')
  return url ? (
    <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
  ) : (
    <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-line/10" />
  )
}

export function PendingPanel() {
  const app = useApp()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [citySelected, setCitySelected] = useState<Set<string>>(new Set())
  const [assignIds, setAssignIds] = useState<string[] | null>(null)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(PENDING_EVENT, onOpen)
    return () => window.removeEventListener(PENDING_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) {
      setSelected(new Set())
      setCitySelected(new Set())
      setAssignIds(null)
    }
  }, [open])

  const pending = app.pendingPhotos
  const cityPending = app.cityPendingPhotos
  const empty = pending.length === 0 && cityPending.length === 0

  const allSelected = useMemo(() => pending.length > 0 && selected.size === pending.length, [pending, selected])
  const cityAllSelected = useMemo(
    () => cityPending.length > 0 && citySelected.size === cityPending.length,
    [cityPending, citySelected]
  )

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleCity = (id: string) =>
    setCitySelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const startPicking = (ids: string[]) => {
    setOpen(false)
    app.startPicking(ids)
  }

  // 批量删除（误导入的照片可直接移除），删除后清空对应选择
  const deleteIds = async (ids: string[], clear: () => void) => {
    await app.deletePhotos(ids)
    clear()
  }

  return (
    <>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`待处理照片 · ${pending.length + cityPending.length}`}
        className="sm:max-w-2xl"
      >
        {empty ? (
          <EmptyState
            icon={<MapPinOff size={30} />}
            title="没有待处理的照片"
            description="不包含 GPS 信息的照片（例如部分社交软件保存的图片）会出现在这里，由你手动指定位置；暂未识别出城市的照片也会在这里等待确认。"
          />
        ) : (
          <div className="space-y-4">
            {pending.length > 0 && (
              <>
                <p className="text-sm leading-relaxed text-muted">
                  这些照片无法从 EXIF 读取到 GPS。我们不会猜测它们的拍摄地 —— 请在地图上为它们指定位置；同一次拍摄的多张可以批量选点。
                </p>
                <div className="flex items-center justify-between">
                  <button
                    className="flex items-center gap-1.5 text-xs font-medium text-accent"
                    onClick={() => setSelected(allSelected ? new Set() : new Set(pending.map((p) => p.id)))}
                  >
                    {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                    {allSelected ? '取消全选' : '全选'}
                  </button>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={selected.size === 0}
                      onClick={() => void deleteIds(Array.from(selected), () => setSelected(new Set()))}
                    >
                      <Trash2 size={14} />
                      删除{selected.size > 0 ? ` ${selected.size} 张` : ''}
                    </Button>
                    <Button
                      size="sm"
                      disabled={selected.size === 0}
                      onClick={() => startPicking(Array.from(selected))}
                    >
                      <Crosshair size={14} />
                      为 {selected.size || ''} 张照片选点
                    </Button>
                  </div>
                </div>
                <div className="scroll-area max-h-[40vh] space-y-1.5">
                  {pending.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-2xl border border-line/[0.07] bg-elevated/40 p-2.5"
                    >
                      <button onClick={() => toggle(p.id)} className="shrink-0 text-muted" aria-label="选择">
                        {selected.has(p.id) ? <CheckSquare size={18} className="text-accent" /> : <Square size={18} />}
                      </button>
                      <RowThumb id={p.id} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-fg">{p.name || p.fileName}</p>
                        <p className="text-xs text-faint">{formatDate(p.takenAt)}{p.camera ? ` · ${p.camera}` : ''}</p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => startPicking([p.id])}>选点</Button>
                      <button
                        onClick={() => void app.deletePhoto(p.id)}
                        aria-label="删除照片"
                        title="删除这张照片"
                        className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {cityPending.length > 0 && (
              <>
                {pending.length > 0 && <div className="border-t border-line/[0.07]" />}
                <div>
                  <h3 className="text-sm font-semibold text-fg">待确认城市 · {cityPending.length}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    这些照片有 GPS 但暂未识别出所属城市（逆地理服务可能暂时不可用），因此不会出现在地图城市标记中。
                    应用启动时会自动重试，你也可以手动指定城市；原始坐标不受影响。
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    className="flex items-center gap-1.5 text-xs font-medium text-accent"
                    onClick={() =>
                      setCitySelected(cityAllSelected ? new Set() : new Set(cityPending.map((p) => p.id)))
                    }
                  >
                    {cityAllSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                    {cityAllSelected ? '取消全选' : '全选'}
                  </button>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={citySelected.size === 0}
                      onClick={() => void deleteIds(Array.from(citySelected), () => setCitySelected(new Set()))}
                    >
                      <Trash2 size={14} />
                      删除{citySelected.size > 0 ? ` ${citySelected.size} 张` : ''}
                    </Button>
                    <Button
                      size="sm"
                      disabled={citySelected.size === 0}
                      onClick={() => setAssignIds(Array.from(citySelected))}
                    >
                      为 {citySelected.size || ''} 张照片指定城市
                    </Button>
                  </div>
                </div>
                <div className="scroll-area max-h-[40vh] space-y-1.5">
                  {cityPending.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-2xl border border-line/[0.07] bg-elevated/40 p-2.5"
                    >
                      <button onClick={() => toggleCity(p.id)} className="shrink-0 text-muted" aria-label="选择">
                        {citySelected.has(p.id) ? <CheckSquare size={18} className="text-accent" /> : <Square size={18} />}
                      </button>
                      <RowThumb id={p.id} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-fg">{p.name || p.fileName}</p>
                        <p className="truncate text-xs text-faint">
                          {formatDate(p.takenAt)} · {p.lat!.toFixed(4)}, {p.lng!.toFixed(4)}
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setAssignIds([p.id])}>指定城市</Button>
                      <button
                        onClick={() => void app.deletePhoto(p.id)}
                        aria-label="删除照片"
                        title="删除这张照片"
                        className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <CityAssignDialog photoIds={assignIds} onClose={() => setAssignIds(null)} />
    </>
  )
}
