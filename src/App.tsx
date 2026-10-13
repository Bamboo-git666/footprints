import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ImagePlus } from 'lucide-react'
import { useApp } from '@/state/app'
import { useTheme } from '@/hooks/useTheme'
import { importFiles } from '@/lib/import'
import { MapView } from '@/components/map/MapView'
import { TopBar } from '@/components/layout/TopBar'
import { UpdatePrompt } from '@/components/layout/UpdatePrompt'
import { BottomNav } from '@/components/layout/BottomNav'
import { AlbumPanel } from '@/components/photos/AlbumPanel'
import { Lightbox } from '@/components/photos/Lightbox'
import { ConfirmLocationDialog } from '@/components/photos/ConfirmLocationDialog'
import { PhotoEditorDialog } from '@/components/photos/PhotoEditorDialog'
import { PendingPanel } from '@/components/photos/PendingPanel'
import { ImportProgress } from '@/components/upload/ImportProgress'
import { Toaster } from '@/components/Toaster'
import { MemoriesPage } from '@/pages/MemoriesPage'
import { JourneysPage } from '@/pages/JourneysPage'
import { StatsPage } from '@/pages/StatsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { cn } from '@/lib/utils'

export default function App() {
  const app = useApp()
  useTheme()
  const [dragging, setDragging] = useState(false)

  // 开发调试句柄（生产构建中 DEV 为 false，整段不会暴露到 window）
  if (import.meta.env.DEV) {
    ;(window as unknown as { __fp?: typeof app }).__fp = app
  }

  useEffect(() => {
    let depth = 0
    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        depth += 1
        setDragging(true)
      }
    }
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      const files = e.dataTransfer?.files
      if (files && files.length > 0) void importFiles(Array.from(files))
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden bg-bg font-sans text-fg antialiased">
      {/* 地图常驻，保持视角；其他视图以覆盖层呈现 */}
      <MapView />

      <TopBar />

      <UpdatePrompt />

      <AnimatePresence>
        {app.view === 'memories' && <MemoriesPage key="memories" />}
        {app.view === 'journeys' && <JourneysPage key="journeys" />}
        {app.view === 'stats' && <StatsPage key="stats" />}
        {app.view === 'settings' && <SettingsPage key="settings" />}
      </AnimatePresence>

      <AlbumPanel />
      <Lightbox />
      <ConfirmLocationDialog />
      <PhotoEditorDialog />
      <PendingPanel />
      <ImportProgress />
      <Toaster />
      <BottomNav />

      {/* 全局拖拽导入遮罩 */}
      <AnimatePresence>
        {dragging && (
          <div
            className={cn(
              'pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-bg/70 backdrop-blur-sm'
            )}
          >
            <div className="flex flex-col items-center gap-4 rounded-[32px] border-2 border-dashed border-accent/60 bg-elevated/60 px-16 py-12">
              <ImagePlus size={40} className="text-accent" />
              <p className="font-serif text-xl italic text-fg">松开以导入照片</p>
              <p className="text-xs text-muted">EXIF 中的 GPS 将被自动识别</p>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* 初始加载 */}
      <AnimatePresence>
        {!app.ready && (
          <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-4 bg-bg">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-14 w-14 animate-pulse" />
            <p className="font-serif text-lg italic text-muted">正在展开你的世界…</p>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
