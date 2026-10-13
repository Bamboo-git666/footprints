import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, FolderInput, ImagePlus, MapPinned, Search, X } from 'lucide-react'
import { useApp } from '@/state/app'
import { importFiles } from '@/lib/import'
import { PlaceSearch } from './PlaceSearch'
import { PENDING_EVENT } from '@/components/photos/PendingPanel'
import { cn } from '@/lib/utils'

export function TopBar() {
  const app = useApp()
  const filesRef = useRef<HTMLInputElement | null>(null)
  const folderRef = useRef<HTMLInputElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileSearch, setMobileSearch] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trigger = () => filesRef.current?.click()
    window.addEventListener('footprints:import', trigger)
    return () => window.removeEventListener('footprints:import', trigger)
  }, [])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const pick = (files: FileList | null) => {
    if (!files || files.length === 0) return
    void importFiles(Array.from(files))
  }

  const pendingCount = app.pendingPhotos.length

  return (
    <>
      <header className="safe-top pointer-events-none absolute inset-x-0 top-0 z-30 px-4 pt-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          {/* 品牌 */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-2.5">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
            <div className="leading-none">
              <p className="font-serif text-[17px] font-semibold italic tracking-tight text-fg">Footprints</p>
              <p className="mt-0.5 hidden text-[10px] uppercase tracking-[0.18em] text-faint sm:block">我的世界影像地图</p>
            </div>
          </div>

          {/* 桌面搜索 */}
          <div className="pointer-events-auto mx-auto hidden w-full max-w-xs md:block lg:max-w-sm">
            <PlaceSearch />
          </div>

          {/* 操作区 */}
          <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-2">
            <IconButton
              onClick={() => setMobileSearch((v) => !v)}
              label={mobileSearch ? '关闭搜索' : '搜索地点'}
              className="md:hidden"
            >
              {mobileSearch ? <X size={17} /> : <Search size={17} />}
            </IconButton>

            <IconButton onClick={() => window.dispatchEvent(new CustomEvent(PENDING_EVENT))} label="待定位照片">
              <MapPinned size={17} />
              {pendingCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </IconButton>

            <IconButton
              onClick={() => folderRef.current?.click()}
              label="导入整个文件夹"
              className="hidden sm:flex"
            >
              <FolderInput size={17} />
            </IconButton>

            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                title="导入照片"
                className="flex h-10 items-center gap-1.5 rounded-full bg-accent pl-4 pr-3 text-[13px] font-semibold text-accent-fg transition hover:bg-accent/90 active:scale-[0.97]"
              >
                <ImagePlus size={16} />
                <span className="hidden sm:inline">导入</span>
                <ChevronDown size={14} className={cn('transition-transform', menuOpen && 'rotate-180')} />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="panel-glass absolute right-0 top-12 z-50 w-52 overflow-hidden rounded-2xl border border-line/10 p-1.5 shadow-float"
                  >
                    <MenuItem onClick={() => { filesRef.current?.click(); setMenuOpen(false) }} icon={<ImagePlus size={16} />}>
                      选择照片
                      <span className="block text-[10px] font-normal text-faint">JPG · PNG · WebP · HEIC</span>
                    </MenuItem>
                    <MenuItem onClick={() => { folderRef.current?.click(); setMenuOpen(false) }} icon={<FolderInput size={16} />}>
                      选择文件夹
                      <span className="block text-[10px] font-normal text-faint">保留子目录结构一并导入</span>
                    </MenuItem>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* 移动端搜索抽屉行 */}
        <AnimatePresence>
          {mobileSearch && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mx-auto mt-2 max-w-6xl md:hidden"
            >
              <PlaceSearch onPicked={() => setMobileSearch(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <input
        ref={filesRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.webp"
        multiple
        className="hidden"
        onChange={(e) => { pick(e.target.files); e.target.value = '' }}
      />
      <input
        ref={(el) => {
          if (el) el.setAttribute('webkitdirectory', '')
          folderRef.current = el
        }}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { pick(e.target.files); e.target.value = '' }}
      />
    </>
  )
}

function MenuItem({
  children, icon, onClick
}: {
  children: React.ReactNode
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-fg transition hover:bg-line/[0.07]"
    >
      <span className="mt-0.5 text-accent">{icon}</span>
      <span>{children}</span>
    </button>
  )
}

/** 顶栏统一圆形图标按钮：尺寸、边框、悬停态保持一致 */
function IconButton({
  children,
  label,
  onClick,
  className
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-full border border-line/10 panel-glass text-muted transition hover:bg-line/[0.06] hover:text-fg active:scale-95',
        className
      )}
    >
      {children}
    </button>
  )
}
