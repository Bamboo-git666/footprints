import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarRange, Check, Images, Pencil, Plus, Route, Sparkles, Trash2, X } from 'lucide-react'
import { useApp } from '@/state/app'
import type { Journey } from '@/types'
import { ViewOverlay } from '@/components/layout/ViewOverlay'
import { JourneyEditorDialog, type JourneyPreset } from '@/components/journey/JourneyEditorDialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/misc'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { getMeta, setMeta } from '@/lib/db'
import { isLocated } from '@/lib/geo'
import { suggestJourneys, type JourneySuggestion } from '@/lib/journey-suggest'
import { formatDate, formatRange } from '@/lib/utils'
import { cn } from '@/lib/utils'

const IGNORED_KEY = 'ignoredJourneySuggestions'

function daysBetween(a: number, b: number): number {
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

function SuggestCover({ photoIds }: { photoIds: string[] }) {
  const app = useApp()
  const coverId = photoIds.find((id) => app.photoMap.has(id)) ?? null
  const url = useBlobUrl(coverId ?? '', 'medium')
  return (
    <div className="relative h-full w-full overflow-hidden">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-line/10" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
    </div>
  )
}

/** 单条旅行建议卡片：展示划分依据，交由用户审核 */
function SuggestionCard({
  s,
  onAccept,
  onIgnore
}: {
  s: JourneySuggestion
  onAccept: () => void
  onIgnore: () => void
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[24px] border border-accent/25 bg-elevated/40">
      <div className="relative h-36">
        <SuggestCover photoIds={s.photoIds} />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
              <Sparkles size={11} /> 建议的旅行
            </p>
            <h3 className="mt-1 truncate font-serif text-lg font-semibold italic tracking-tight text-white">{s.name}</h3>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col px-4 py-3">
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <CalendarRange size={12} className="text-accent" />
          {formatRange(s.startDate, s.endDate)} · {daysBetween(s.startDate, s.endDate)} 天
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          {s.photoIds.length} 张照片
          {s.cities.length > 0 && <> · {s.cities.slice(0, 3).join('、')}{s.cities.length > 3 ? ` 等 ${s.cities.length} 座城市` : ''}</>}
          {s.spanKm > 50 && <> · 跨度约 {Math.round(s.spanKm)} km</>}
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-faint">
          依据：连续 {daysBetween(s.startDate, s.endDate)} 天内的拍摄记录
        </p>
        <div className="mt-auto flex items-center gap-2 pt-3">
          <Button size="sm" onClick={onAccept} className="flex-1">
            <Check size={14} /> 审核并保存
          </Button>
          <button
            onClick={onIgnore}
            aria-label="忽略这条建议"
            title="忽略这条建议"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-line/10 hover:text-fg"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </article>
  )
}

export function JourneysPage() {
  const app = useApp()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Journey | null>(null)
  const [preset, setPreset] = useState<JourneyPreset | null>(null)
  const [editorTitle, setEditorTitle] = useState<string | undefined>(undefined)
  const [ignored, setIgnored] = useState<string[]>([])

  useEffect(() => {
    void getMeta<string[]>(IGNORED_KEY, []).then(setIgnored)
  }, [app.journeys.length])

  const suggestions = useMemo(() => {
    const all = suggestJourneys(app.photos)
    const ignoredSet = new Set(ignored)
    return all.filter((s) => !ignoredSet.has(s.id))
  }, [app.photos, ignored])

  const ignoreSuggestion = async (s: JourneySuggestion) => {
    const next = [...ignored, s.id]
    setIgnored(next)
    await setMeta(IGNORED_KEY, next)
  }

  const acceptSuggestion = (s: JourneySuggestion) => {
    setEditing(null)
    setPreset({
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
      photoIds: s.photoIds
    })
    setEditorTitle('审核建议的旅行')
    setEditorOpen(true)
  }

  const openNew = () => {
    setEditing(null)
    setPreset(null)
    setEditorTitle(undefined)
    setEditorOpen(true)
  }
  const openEdit = (j: Journey) => {
    setPreset(null)
    setEditing(j)
    setEditorTitle(undefined)
    setEditorOpen(true)
  }

  const openJourney = (j: Journey) => {
    const members = j.photoIds.flatMap((id) => app.photoMap.get(id) ?? [])
    const located = members.filter(isLocated)
    app.setJourneyFilterId(j.id)
    app.setView('map')
    if (located.length) app.mapCtl.current?.fitPhotoPoints(located, 13)
    app.openAlbum(members.map((p) => p.id))
  }

  const confirmDelete = async (j: Journey) => {
    if (window.confirm(`确定删除旅行「${j.name}」吗？其中的照片不会被删除。`)) {
      await app.deleteJourney(j.id)
    }
  }

  return (
    <ViewOverlay
      title="我的旅行"
      eyebrow="Journeys"
      action={
        <Button onClick={openNew} className="mr-2">
          <Plus size={16} /> 新建旅行
        </Button>
      }
    >
      {/* 智能推荐：基于拍摄时间与位置生成，需用户确认 */}
      {suggestions.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-muted">发现可能的旅行</h2>
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
              {suggestions.length} 条建议
            </span>
          </div>
          <p className="mb-4 max-w-2xl text-xs leading-relaxed text-faint">
            依据连续数日内密集拍摄且未归档的照片推断，仅供参考——请审核名称、日期与照片后再保存。
            {suggestions.length > 6 && <> 目前显示最近的 6 条，共 {suggestions.length} 条。</>}
          </p>
          <div className={cn('grid gap-4', suggestions.length === 1 ? 'max-w-sm' : 'sm:grid-cols-2 lg:grid-cols-3')}>
            {suggestions.slice(0, 6).map((s) => (
              <SuggestionCard key={s.id} s={s} onAccept={() => acceptSuggestion(s)} onIgnore={() => void ignoreSuggestion(s)} />
            ))}
          </div>
        </section>
      )}

      {app.journeys.length === 0 && suggestions.length === 0 ? (
        <EmptyState
          icon={<Route size={30} />}
          title="还没有创建旅行"
          description="把同一趟旅程的照片编入一次旅行，设置封面与描述，之后可以在地图上只看这趟旅行的足迹。旅行不会替你画出未走过的路线。"
          action={<Button onClick={openNew}><Plus size={16} /> 创建第一次旅行</Button>}
        />
      ) : app.journeys.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line/15 p-4 text-center text-sm text-muted">
          暂无已保存的旅行。可以先处理上方建议，或手动新建。
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {app.journeys.map((j) => (
            <JourneyCard
              key={j.id}
              journey={j}
              count={j.photoIds.reduce((n, id) => (app.photoMap.has(id) ? n + 1 : n), 0)}
              coverId={j.coverPhotoId && app.photoMap.has(j.coverPhotoId) ? j.coverPhotoId : j.photoIds.find((id) => app.photoMap.has(id)) ?? null}
              onOpen={() => openJourney(j)}
              onEdit={() => openEdit(j)}
              onDelete={() => void confirmDelete(j)}
            />
          ))}
        </div>
      )}

      <JourneyEditorDialog
        open={editorOpen}
        journey={editing}
        preset={preset}
        title={editorTitle}
        onClose={() => setEditorOpen(false)}
      />
    </ViewOverlay>
  )
}

function JourneyCard({
  journey,
  count,
  coverId,
  onOpen,
  onEdit,
  onDelete
}: {
  journey: Journey
  count: number
  coverId: string | null
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const cover = useBlobUrl(coverId ?? '', 'medium')
  return (
    <article className="group overflow-hidden rounded-[28px] border border-line/[0.08] bg-elevated/40 transition hover:border-line/20 hover:shadow-float">
      <button onClick={onOpen} className="relative block aspect-[4/3] w-full overflow-hidden" aria-label={`查看${journey.name}`}>
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-line/[0.06] text-faint">
            <Images size={28} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-left">
          <h3 className="font-serif text-xl font-semibold italic tracking-tight text-white">{journey.name}</h3>
          {(journey.startDate || journey.endDate) && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-white/75">
              <CalendarRange size={12} />
              {journey.startDate && journey.endDate
                ? formatRange(journey.startDate, journey.endDate)
                : journey.startDate
                  ? `${formatDate(journey.startDate)} 起`
                  : `至 ${formatDate(journey.endDate)}`}
            </p>
          )}
        </div>
      </button>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button onClick={onOpen} className="flex items-center gap-1.5 text-sm text-muted transition hover:text-fg">
          {count} 张照片 <ArrowRight size={14} />
        </button>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} aria-label="编辑旅行" className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-line/10 hover:text-fg">
            <Pencil size={15} />
          </button>
          <button onClick={onDelete} aria-label="删除旅行" className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-danger/15 hover:text-danger">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {journey.description && <p className="px-4 pb-4 text-sm leading-relaxed text-muted">{journey.description}</p>}
    </article>
  )
}
