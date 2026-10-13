import { useState } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { useApp } from '@/state/app'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'

/** 手动点亮城市：输入城市名即可点亮其行政区划区域（无需照片），支持移除 */
export function ManualLitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp()
  const [name, setName] = useState('')

  const submit = () => {
    if (name.trim() && app.addManualLit(name)) setName('')
  }

  return (
    <Modal open={open} onClose={onClose} title="手动点亮城市" className="sm:max-w-md">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted">
          输入城市名，点亮它在地图上的整个行政区域——无需照片。支持市名、简称或区县名（如「景德镇」「深圳」「南山区」）。
        </p>
        <div className="flex gap-2">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="输入城市名…"
          />
          <Button onClick={submit} disabled={!name.trim()}>
            <Sparkles size={14} /> 点亮
          </Button>
        </div>
        {app.manualLit.length > 0 && (
          <div>
            <Label>已手动点亮</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {app.manualLit.map((n) => (
                <span
                  key={n}
                  className="flex items-center gap-1 rounded-full bg-accent/10 py-1 pl-2.5 pr-1 text-xs font-medium text-accent"
                >
                  {n}
                  <button
                    onClick={() => app.removeManualLit(n)}
                    aria-label={`移除 ${n}`}
                    title="取消点亮"
                    className="rounded-full p-1 transition hover:bg-accent/20"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
