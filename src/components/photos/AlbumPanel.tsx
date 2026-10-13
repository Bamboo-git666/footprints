import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarRange, ChevronDown, Crosshair, NotebookPen, Pencil, X } from 'lucide-react'
import { useApp } from '@/state/app'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { PhotoThumb } from './PhotoThumb'
import { placeDisplayName, placeSubtitle, placeKeyOf, getPlaceNote, setPlaceNote, getCityDiary, setCityDiary, type CityDiary } from '@/lib/place'
import { cityKeyOf } from '@/lib/cities'
import { formatDate, formatRange, cn } from '@/lib/utils'
import type { Photo } from '@/types'

/** 封面图：按照片真实宽高比自适应展示，避免主体被裁切 */
function Hero({ photo }: { photo: Photo }) {
  const url = useBlobUrl(photo.id, 'medium')
  const ratio = photo.width && photo.height ? photo.width / photo.height : 4 / 3
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl bg-line/[0.06]"
      style={{ aspectRatio: `${ratio}`, maxHeight: 'min(46vh, 380px)' }}
    >
      {url ? (
        <img src={url} alt={photo.name || photo.fileName} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse bg-line/10" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
      <div className="absolute bottom-2.5 left-3.5 flex items-center gap-1.5 text-[11px] font-medium text-white/85">
        <CalendarRange size={11} />
        {formatDate(photo.takenAt)}
      </div>
    </div>
  )
}

function PanelContent({
  photoIds,
  focus,
  titleOverride,
  subtitleOverride
}: {
  photoIds: string[]
  focus: { lat: number; lng: number } | null
  /** 城市相册等场景的标题覆盖 */
  titleOverride?: string
  subtitleOverride?: string
}) {
  const app = useApp()
  const photos = useMemo(
    () =>
      photoIds
        .flatMap((id) => {
          const p = app.photoMap.get(id)
          return p ? [p] : []
        })
        .sort((a, b) => a.takenAt - b.takenAt),
    [photoIds, app.photoMap]
  )

  // 封面索引：多图时可由缩略图条切换；始终从焦点最近照片开始
  const initialIndex = useMemo(() => {
    if (!focus || photos.length === 0) return 0
    let idx = 0
    let best = Infinity
    photos.forEach((p, i) => {
      if (p.lat === null || p.lng === null) return
      const d = (p.lat - focus.lat) ** 2 + (p.lng - focus.lng) ** 2
      if (d < best) {
        best = d
        idx = i
      }
    })
    return idx
    // 仅在照片集合变化时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos])
  const [coverIndex, setCoverIndex] = useState(initialIndex)
  useEffect(() => setCoverIndex(initialIndex), [initialIndex])

  // 地点名编辑 + 地点级备注
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const placeKey = useMemo(() => placeKeyOf(photos), [photos])
  const [placeNote, setPlaceNoteState] = useState('')

  useEffect(() => {
    if (!placeKey) return
    void getPlaceNote(placeKey).then(setPlaceNoteState)
  }, [placeKey])

  // 城市日记：按城市三元组键（同一城市的相册共享一篇日记）
  const cityKey = useMemo(() => (photos[0] ? cityKeyOf(photos[0]) : null), [photos])
  const [diary, setDiary] = useState<CityDiary | null>(null)
  const [diaryEditing, setDiaryEditing] = useState(false)
  const [diaryDraft, setDiaryDraft] = useState('')

  useEffect(() => {
    setDiaryEditing(false)
    if (!cityKey) {
      setDiary(null)
      return
    }
    void getCityDiary(cityKey).then(setDiary)
  }, [cityKey])

  const startDiaryEdit = () => {
    setDiaryDraft(diary?.content ?? '')
    setDiaryEditing(true)
  }

  const saveDiary = async () => {
    setDiaryEditing(false)
    if (!cityKey) return
    const content = diaryDraft.trim()
    if (content) {
      const next: CityDiary = { content, updatedAt: Date.now() }
      await setCityDiary(cityKey, content)
      setDiary(next)
    } else {
      await setCityDiary(cityKey, '')
      setDiary(null)
    }
  }

  const startEdit = () => {
    setNameDraft(titleOverride ?? placeDisplayName(photos))
    setNoteDraft(placeNote)
    setEditing(true)
  }

  const savePlace = async () => {
    setEditing(false)
    const name = nameDraft.trim()
    const current = placeDisplayName(photos)
    // 地点名：批量写入该地点全部照片的 placeName（复用既有字段，无 schema 变更）
    if (name && name !== current) {
      await app.updatePhotos(photos.map((p) => p.id), { placeName: name })
    }
    // 个人备注：存地点键
    if (placeKey) {
      await setPlaceNote(placeKey, noteDraft)
      setPlaceNoteState(noteDraft.trim())
    }
  }

  if (photos.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
        <p className="text-sm text-muted">这个相册里的照片已被删除或当前筛选不可见。</p>
        <button className="text-sm text-accent" onClick={app.closeAlbum}>关闭</button>
      </div>
    )
  }

  const single = photos.length === 1
  const cover = photos[Math.min(coverIndex, photos.length - 1)]
  const title = titleOverride ?? placeDisplayName(photos)
  const subtitle = subtitleOverride ?? placeSubtitle(photos)
  const range = formatRange(photos[0].takenAt, photos[photos.length - 1].takenAt)

  const locateOnMap = () => {
    const target =
      cover.lat !== null && cover.lng !== null
        ? { lat: cover.lat, lng: cover.lng }
        : focus
    app.closeAlbum()
    if (target) app.requestMapFocus(target.lng, target.lat, 15)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-3 pt-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight">{title}</h2>
            {subtitle && subtitle !== title && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
            <p className="mt-1 text-xs tabular-nums text-muted">{range}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {cityKey && (
              <button
                onClick={() => (diaryEditing ? void saveDiary() : startDiaryEdit())}
                aria-label={diaryEditing ? '保存城市日记' : '城市日记'}
                title={diaryEditing ? '保存日记' : diary?.content ? '查看 / 编辑城市日记' : '写城市日记'}
                className={cn(
                  'rounded-full p-2 transition',
                  diaryEditing || diary?.content ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-line/[0.08] hover:text-fg'
                )}
              >
                <NotebookPen size={16} />
              </button>
            )}
            {(placeKey || photos.length > 0) && (
              <button
                onClick={editing ? savePlace : startEdit}
                aria-label={editing ? '保存地点信息' : '编辑地点名称与备注'}
                title={editing ? '保存' : '编辑地点名称与备注'}
                className={cn(
                  'rounded-full p-2 transition',
                  editing ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-line/[0.08] hover:text-fg'
                )}
              >
                {editing ? <Pencil size={16} className="rotate-[-90deg]" /> : <Pencil size={16} />}
              </button>
            )}
            {(focus || cover.lat !== null) && (
              <button
                onClick={locateOnMap}
                aria-label="在地图上查看精确位置"
                title="在地图上查看精确位置"
                className="rounded-full p-2 text-muted transition hover:bg-line/[0.08] hover:text-fg"
              >
                <Crosshair size={16} />
              </button>
            )}
            <button
              onClick={app.closeAlbum}
              aria-label="关闭相册"
              className="hidden rounded-full p-2 text-muted transition hover:bg-line/[0.08] hover:text-fg md:block"
            >
              <X size={18} />
            </button>
            <button
              onClick={app.closeAlbum}
              aria-label="收起"
              className="rounded-full p-2 text-muted transition hover:bg-line/[0.08] hover:text-fg md:hidden"
            >
              <ChevronDown size={20} />
            </button>
          </div>
        </div>

        {/* 地点名 / 备注编辑器 */}
        <AnimatePresence>
          {editing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 overflow-hidden"
            >
              <div className="space-y-2 rounded-2xl border border-line/[0.08] bg-elevated/50 p-3">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="地点名称"
                  className="w-full rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50"
                />
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="关于这个地方的个人备注…"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-line/10 bg-bg/60 px-3 py-2 text-sm outline-none focus:border-accent/50"
                />
                <p className="text-[10px] text-faint">名称将同步到该地点的 {photos.length} 张照片</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 地点备注（只读展示） */}
        {placeNote && !editing && (
          <p className="mb-3 rounded-2xl border border-line/[0.06] bg-elevated/40 px-3.5 py-2.5 text-sm leading-relaxed text-muted">
            {placeNote}
          </p>
        )}

        {/* 城市日记：编辑态 / 只读展示 */}
        {cityKey && diaryEditing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 overflow-hidden"
          >
            <div className="space-y-2 rounded-2xl border border-accent/20 bg-elevated/50 p-3">
              <textarea
                autoFocus
                value={diaryDraft}
                onChange={(e) => setDiaryDraft(e.target.value)}
                placeholder={`关于${title}的日记——当时的心情、遇到的趣事、想记住的一切…`}
                rows={5}
                className="w-full resize-none rounded-xl border border-line/10 bg-bg/60 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-accent/50"
              />
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-faint">清空内容保存即删除日记 · 随备份导出</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDiaryEditing(false)}
                    className="rounded-full px-3 py-1.5 text-xs text-muted transition hover:text-fg"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => void saveDiary()}
                    className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90"
                  >
                    保存日记
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {cityKey && diary?.content && !diaryEditing && (
          <div className="mb-3 rounded-2xl border border-line/[0.06] border-l-2 border-l-accent/50 bg-elevated/40 px-4 py-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg/90">{diary.content}</p>
            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[10px] text-faint">城市日记 · 更新于 {formatDate(diary.updatedAt)}</span>
              <button onClick={startDiaryEdit} className="text-xs font-medium text-accent transition hover:text-accent/80">
                编辑
              </button>
            </div>
          </div>
        )}

        {/* 封面：单图时不重复渲染缩略图列表（下方直接进入大图模式） */}
        {!single ? (
          <div className="relative">
            <button
              onClick={() => app.openLightbox(photos.map((p) => p.id), Math.min(coverIndex, photos.length - 1))}
              className="block w-full text-left"
              aria-label="全屏查看封面照片"
            >
              <Hero photo={cover} />
            </button>
            <span className="absolute right-2.5 top-2.5 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
              {Math.min(coverIndex, photos.length - 1) + 1} / {photos.length}
            </span>
          </div>
        ) : (
          <button
            onClick={() => app.openLightbox([photos[0].id], 0)}
            className="block w-full text-left"
            aria-label="全屏查看照片"
          >
            <Hero photo={photos[0]} />
          </button>
        )}

        <div className="mt-3 flex items-center gap-2 text-xs text-muted">
          <CalendarRange size={13} className="text-accent" />
          <span>{single ? formatDate(photos[0].takenAt) : range}</span>
          <span className="text-faint">·</span>
          <span>{photos.length} 张照片</span>
        </div>
      </div>

      {/* 多图：缩略图胶片条，与封面联动（点击切换封面，双击直接全屏） */}
      {!single && (
        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-5 pb-10">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p, i) => (
              <PhotoThumb
                key={p.id}
                photo={p}
                onClick={() => (i === coverIndex ? app.openLightbox(photos.map((x) => x.id), i) : setCoverIndex(i))}
                className={cn(
                  'transition',
                  i === coverIndex ? 'ring-2 ring-accent ring-offset-2 ring-offset-[hsl(var(--surface))]' : 'opacity-75 hover:opacity-100'
                )}
              />
            ))}
          </div>
        </div>
      )}
      {single && <div className="flex-1" />}
    </div>
  )
}

export function AlbumPanel() {
  const app = useApp()
  const album = app.album
  return (
    <AnimatePresence>
      {album && (
        <div className="fixed inset-0 z-40">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30 md:bg-transparent"
            onClick={app.closeAlbum}
          />
          {/* 桌面：右侧滑出（min/max 宽度约束）；移动：底部弹出 */}
          <motion.aside
            initial={{ x: 60, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 38 }}
            className="panel-glass absolute right-0 top-0 hidden h-full w-[min(460px,42vw)] min-w-[340px] border-l border-line/10 shadow-float md:block"
          >
            <PanelContent
              photoIds={album.photoIds}
              focus={album.focus}
              titleOverride={album.title}
              subtitleOverride={album.subtitle}
            />
          </motion.aside>
          <motion.aside
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 38 }}
            className="panel-glass absolute inset-x-0 bottom-0 h-[82vh] rounded-t-3xl border-t border-line/10 shadow-float md:hidden"
          >
            <div className="flex justify-center pt-2.5">
              <span className="h-1 w-10 rounded-full bg-line/20" />
            </div>
            <PanelContent
              photoIds={album.photoIds}
              focus={album.focus}
              titleOverride={album.title}
              subtitleOverride={album.subtitle}
            />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}
