import { useMemo, useState } from 'react'
import { BarChart3, CalendarDays, Camera, Globe2, MapPin, Route, Sparkles, Star } from 'lucide-react'
import { useApp } from '@/state/app'
import { ViewOverlay } from '@/components/layout/ViewOverlay'
import { EmptyState } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { countDistinctSpots } from '@/lib/geo'
import { cityKeyOf } from '@/lib/cities'
import { ymd, cn } from '@/lib/utils'

export function StatsPage() {
  const app = useApp()
  const [litOpen, setLitOpen] = useState(false)

  const stats = useMemo(() => {
    const countries = new Set<string>()
    const cities = new Set<string>()
    const byYear = new Map<number, { count: number; cities: Set<string>; countries: Set<string> }>()
    const byMonth = new Array(12).fill(0) as number[]
    const cityCounts = new Map<string, { n: number; city: string; region: string | null; country: string | null }>()

    for (const p of app.photos) {
      if (p.countryCode) countries.add(p.countryCode)
      const key = cityKeyOf(p)
      if (key) {
        cities.add(key)
        const row = cityCounts.get(key) ?? { n: 0, city: p.city as string, region: p.region, country: p.country }
        row.n += 1
        cityCounts.set(key, row)
      }

      const { year, month } = ymd(p.takenAt)
      byMonth[month - 1] += 1
      const row = byYear.get(year) ?? { count: 0, cities: new Set<string>(), countries: new Set<string>() }
      row.count += 1
      if (key) row.cities.add(key)
      if (p.countryCode) row.countries.add(p.countryCode)
      byYear.set(year, row)
    }

    const years = Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, v]) => ({ year, count: v.count, cities: v.cities.size, countries: v.countries.size }))

    // 摄影历程：每年「首次到达」的城市（按全局城市首次出现年份归属）
    const cityFirstYear = new Map<string, { name: string; year: number }>()
    for (const p of app.photos) {
      const key = cityKeyOf(p)
      if (!key) continue
      const y = ymd(p.takenAt).year
      const cur = cityFirstYear.get(key)
      if (cur === undefined || y < cur.year) cityFirstYear.set(key, { name: p.city as string, year: y })
    }
    const newCitiesByYear = new Map<number, string[]>()
    for (const { name, year } of cityFirstYear.values()) {
      const arr = newCitiesByYear.get(year) ?? []
      arr.push(name)
      newCitiesByYear.set(year, arr)
    }

    const topCities = Array.from(cityCounts.values())
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)

    const maxCount = Math.max(1, ...years.map((y) => y.count))
    const maxMonth = Math.max(1, ...byMonth)
    const maxCity = Math.max(1, ...topCities.map((c) => c.n))

    return {
      countries: countries.size,
      cities: cities.size,
      spots: countDistinctSpots(app.locatedPhotos),
      total: app.photos.length,
      located: app.locatedPhotos.length,
      pending: app.pendingPhotos.length,
      journeys: app.journeys.length,
      years,
      maxCount,
      byMonth,
      maxMonth,
      topCities,
      maxCity,
      newCitiesByYear
    }
  }, [app.photos, app.locatedPhotos, app.pendingPhotos.length, app.journeys.length])

  if (stats.total === 0) {
    return (
      <ViewOverlay title="我的足迹" eyebrow="Footprints">
        <EmptyState
          icon={<Globe2 size={30} />}
          title="足迹将从你的照片中生长"
          description="国家、城市与拍摄地点只从真实的照片 GPS 与地理信息统计，不会凭空出现。导入第一批照片后回到这里。"
          action={<Button onClick={() => window.dispatchEvent(new CustomEvent('footprints:import'))}>导入照片</Button>}
        />
      </ViewOverlay>
    )
  }

  const cards: { icon: typeof Globe2; value: number; label: string; note: string; onClick?: () => void }[] = [
    { icon: Globe2, value: stats.countries, label: '国家 / 地区', note: '仅统计含有效国家信息的照片' },
    { icon: MapPin, value: stats.cities, label: '城市', note: '按国家 + 城市名去重' },
    { icon: Star, value: app.litCities.length, label: '已点亮城市', note: '照片落在即点亮 · 含手动点亮', onClick: () => setLitOpen(true) },
    { icon: Sparkles, value: stats.spots, label: '拍摄地点', note: '地图上约 500 米范围内聚合为一个点' },
    { icon: Camera, value: stats.total, label: '照片总数', note: `${stats.located} 张已定位${stats.pending ? ` · ${stats.pending} 张待定位` : ''}` },
    { icon: Route, value: stats.journeys, label: '旅行次数', note: '你手动创建的旅行' }
  ]

  return (
    <ViewOverlay title="我的足迹" eyebrow="Footprints">
      {/* 主数字 */}
      <section className="mb-10">
        <p className="text-sm text-muted">截至目前，我在世界地图上留下了</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className="font-serif text-[64px] font-semibold italic leading-none tracking-tight text-fg">{stats.spots}</span>
          <span className="text-sm text-muted">个拍摄地点 · 跨越 {stats.countries} 个国家/地区、{stats.cities} 座城市 · 已点亮 {app.litCities.length} 座</span>
        </div>
      </section>

      {/* 统计卡片 */}
      <section className="mb-14 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map(({ icon: Icon, value, label, note, onClick }) => {
          const inner = (
            <>
              <Icon size={18} className="text-accent" />
              <p className="mt-4 font-serif text-4xl font-semibold tracking-tight text-fg">{value}</p>
              <p className="mt-1 text-sm font-medium text-fg">{label}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{note}</p>
            </>
          )
          return onClick ? (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="rounded-3xl border border-line/[0.08] bg-elevated/40 p-5 text-left transition hover:border-accent/30 hover:bg-elevated/70"
            >
              {inner}
            </button>
          ) : (
            <div key={label} className="rounded-3xl border border-line/[0.08] bg-elevated/40 p-5">
              {inner}
            </div>
          )
        })}
      </section>

      {/* 已点亮城市列表 */}
      <LitCitiesDialog open={litOpen} onClose={() => setLitOpen(false)} />

      {/* 年度柱状图 */}
      <section className="mb-14">
        <h2 className="mb-5 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-muted">
          <BarChart3 size={15} /> 每年的摄影记录
        </h2>
        <div className="rounded-3xl border border-line/[0.08] bg-elevated/40 p-6">
          <div className="flex h-52 items-end gap-3 sm:gap-5">
            {stats.years.map((y) => (
              <button
                key={y.year}
                onClick={() => { app.setYear(app.year === y.year ? null : y.year); app.setView('map') }}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                title={`${y.year} 年 ${y.count} 张`}
              >
                <span className="text-xs font-medium text-muted opacity-0 transition group-hover:opacity-100">{y.count}</span>
                <div
                  className={cn(
                    'w-full max-w-12 rounded-t-2xl transition-all duration-500',
                    app.year === y.year ? 'bg-accent' : 'bg-line/25 group-hover:bg-accent/70'
                  )}
                  style={{ height: `${Math.max(6, (y.count / stats.maxCount) * 100)}%` }}
                />
                <span className={cn('text-xs', app.year === y.year ? 'font-semibold text-fg' : 'text-muted')}>{y.year}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 月份分布 + 最常拍摄的城市 */}
      <section className="mb-14 grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <h2 className="mb-5 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-muted">
            <CalendarDays size={15} /> 各月份的照片分布
          </h2>
          <div className="rounded-3xl border border-line/[0.08] bg-elevated/40 p-6">
            <div className="flex h-44 items-end gap-1.5 sm:gap-2.5">
              {stats.byMonth.map((n, i) => (
                <div key={i} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${i + 1} 月 · ${n} 张`}>
                  <span className={cn('text-[10px] tabular-nums', n > 0 ? 'text-muted' : 'text-faint/50')}>{n || ''}</span>
                  <div
                    className={cn(
                      'w-full rounded-t-lg transition-all duration-500',
                      n > 0 ? 'bg-line/25 group-hover:bg-accent/70' : 'bg-line/10'
                    )}
                    style={{ height: `${n > 0 ? Math.max(6, (n / stats.maxMonth) * 100) : 3}%` }}
                  />
                  <span className="text-[10px] text-muted">{i + 1}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-faint">照片最多的月份是 {stats.byMonth.indexOf(stats.maxMonth) + 1} 月，共 {stats.maxMonth} 张。</p>
          </div>
        </div>
        <div className="lg:col-span-2">
          <h2 className="mb-5 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-muted">
            <MapPin size={15} /> 最常拍摄的城市
          </h2>
          <div className="rounded-3xl border border-line/[0.08] bg-elevated/40 p-6">
            {stats.topCities.length === 0 ? (
              <p className="py-6 text-center text-xs text-faint">暂无含城市信息的照片</p>
            ) : (
              <div className="space-y-3.5">
                {stats.topCities.map((c, i) => (
                  <div key={`${c.city}-${i}`} className="flex items-center gap-3">
                    <span className="w-4 shrink-0 text-right text-xs tabular-nums text-faint">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium text-fg">{c.city}</p>
                        <span className="shrink-0 text-xs tabular-nums text-muted">{c.n} 张</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/10">
                        <div className="h-full rounded-full bg-accent/80" style={{ width: `${(c.n / stats.maxCity) * 100}%` }} />
                      </div>
                      {c.country && <p className="mt-1 text-[10px] text-faint">{c.country}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-[11px] leading-relaxed text-faint">仅统计带有城市信息的照片，未识别的地点不会计入。</p>
          </div>
        </div>
      </section>

      {/* 摄影历程：逐年记录 + 首次到达的城市 */}
      <section className="space-y-3">
        <h2 className="mb-5 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-muted">
          <Route size={15} /> 我的摄影历程
        </h2>
        {stats.years.slice().reverse().map((y) => {
          const firstCities = (stats.newCitiesByYear.get(y.year) ?? []).slice(0, 4)
          const more = (stats.newCitiesByYear.get(y.year) ?? []).length - firstCities.length
          return (
            <button
              key={y.year}
              onClick={() => { app.setYear(y.year); app.setView('map') }}
              className="flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-3xl border border-line/[0.08] bg-elevated/40 px-6 py-5 text-left transition hover:border-accent/30"
            >
              <div className="min-w-0">
                <p className="font-serif text-2xl font-semibold italic text-fg">{y.year}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {y.countries} 个国家/地区 · {y.cities} 座城市 · {y.count} 张照片
                </p>
              </div>
              {firstCities.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Sparkles size={12} className="text-accent" />
                  {firstCities.map((c) => (
                    <span key={c} className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
                      {c}
                    </span>
                  ))}
                  {more > 0 && <span className="text-[11px] text-faint">+{more}</span>}
                </div>
              )}
            </button>
          )
        })}
      </section>

      {stats.pending > 0 && (
        <p className="mt-10 rounded-2xl border border-dashed border-line/15 p-4 text-center text-sm text-muted">
          另有 {stats.pending} 张照片尚未定位，未计入地点统计。
          <button onClick={() => window.dispatchEvent(new CustomEvent('footprints:pending'))} className="ml-1 font-medium text-accent">去处理 →</button>
        </p>
      )}
    </ViewOverlay>
  )
}

/** 已点亮城市列表：城市名 chips，点击可定位到地图对应位置（手动点亮无坐标时不可点） */
function LitCitiesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp()

  const locate = (city: string) => {
    const group = app.allCityGroups.find((g) => g.city === city)
    if (!group) return
    app.setView('map')
    app.requestMapFocus(group.lng, group.lat, 6)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`已点亮 ${app.litCities.length} 座城市`} className="sm:max-w-md">
      {app.litCities.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          还没有点亮任何城市——导入带位置的照片，或在地图右侧工具栏手动点亮。
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {app.litCities.map((c) => {
            const manual = c.key.startsWith('manual:')
            const canLocate = app.allCityGroups.some((g) => g.city === c.city)
            return (
              <button
                key={c.key}
                type="button"
                disabled={!canLocate}
                onClick={() => locate(c.city)}
                title={canLocate ? '点击在地图上查看' : '手动点亮 · 暂无坐标'}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent',
                  'transition enabled:hover:bg-accent/20 disabled:cursor-default disabled:opacity-55'
                )}
              >
                {c.city}
                {c.count > 0 && (
                  <span className="rounded-full bg-accent/15 px-1.5 text-[11px] leading-5">{c.count}</span>
                )}
                {manual && <span className="text-[10px] text-faint">手动</span>}
              </button>
            )
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        点击城市名可跳转到地图对应位置；标「手动」的是无照片、由你手动点亮的城市。
      </p>
    </Modal>
  )
}
