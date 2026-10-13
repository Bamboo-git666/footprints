import { useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { Pause, Play, Repeat, X } from 'lucide-react'
import { useApp } from '@/state/app'
import { formatDateShort, ymd, clamp } from '@/lib/utils'
import { cn } from '@/lib/utils'

const FULL_SWEEP_MS = 24000 // 1x 速度下完整回放一遍的时长
const TICK_MS = 160
const SPEEDS = [0.5, 1, 2, 4]

/**
 * 时光回放控制条：时间轴拖动、播放/暂停、速度切换。
 * 播放时地图标记按拍摄日期依次出现（由 app.mapMarkerPhotos 过滤实现）。
 */
export function PlaybackBar() {
  const app = useApp()
  const { playback } = app
  const rangeRef = useRef<HTMLInputElement>(null)

  const { min, max } = useMemo(() => {
    let mn = Infinity
    let mx = -Infinity
    for (const p of app.locatedPhotos) {
      if (p.takenAt < mn) mn = p.takenAt
      if (p.takenAt > mx) mx = p.takenAt
    }
    return { min: mn, max: mx }
  }, [app.locatedPhotos])

  const span = Math.max(max - min, 1)

  // 播放节拍：按速度推进时间点，播到末尾自动暂停
  useEffect(() => {
    if (!playback.active || !playback.playing) return
    const step = (span * (TICK_MS / FULL_SWEEP_MS)) * playback.speed
    const iv = setInterval(() => {
      const cur = app.playback.until ?? min
      const next = cur + step
      if (next >= max) {
        app.setPlaybackUntil(max)
        app.setPlaybackPlaying(false)
      } else {
        app.advancePlayback(step)
      }
    }, TICK_MS)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.active, playback.playing, playback.speed, playback.until, min, max, span])

  // 离开地图视图时自动暂停（MapView 常驻，回放状态会保留）
  useEffect(() => {
    if (app.view !== 'map' && playback.playing) app.setPlaybackPlaying(false)
  }, [app.view]) // eslint-disable-line react-hooks/exhaustive-deps

  // 时间轴上的年份刻度（跨度长时只标注起止，跨度短时标注每个月初）
  const ticks = useMemo(() => {
    const out: Array<{ pos: number; label: string | null }> = []
    const days = span / 86400000
    const push = (t: number, label: string | null) => out.push({ pos: ((t - min) / span) * 100, label })
    if (days <= 400) {
      // 年内尺度：标注 1/4/7/10 月
      const start = new Date(min)
      for (let y = start.getFullYear(); y <= new Date(max).getFullYear(); y++) {
        for (const m of [0, 3, 6, 9]) {
          const t = new Date(y, m, 1).getTime()
          if (t >= min && t <= max) push(t, m === 0 ? `${y}` : `${m + 1}月`)
        }
      }
    } else {
      push(min, `${ymd(min).year}`)
      push(max, `${ymd(max).year}`)
      const midY = ymd(min + span / 2).year
      const midT = new Date(midY, 0, 1).getTime()
      if (midT > min && midT < max && days > 900) push(midT, `${midY}`)
    }
    return out.filter((t, i) => out.findIndex((x) => x.pos === t.pos) === i && (t.label !== null || i === 0))
  }, [min, max, span])

  if (!playback.active || playback.until === null) return null

  // 筛选变化时 until 可能越界，展示时夹紧
  const until = Math.min(playback.until, max)
  const frac = clamp((until - min) / span, 0, 1)
  const shown = app.mapMarkerPhotos.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-20 flex justify-center px-4 md:bottom-[86px]"
    >
      <div className="pointer-events-auto w-full max-w-xl rounded-2xl panel-glass border border-line/10 px-4 pb-2.5 pt-3 shadow-float">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => app.setPlaybackPlaying(!playback.playing)}
            aria-label={playback.playing ? '暂停回放' : '播放回放'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg shadow-marker transition hover:brightness-110 active:scale-95"
          >
            {playback.playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
          </button>

          <div className="w-[86px] shrink-0 leading-none">
            <p className="text-[13px] font-semibold tabular-nums text-fg">{formatDateShort(until)}</p>
            <p className="mt-1 text-[10px] tabular-nums text-faint">
              {shown} / {app.locatedPhotos.length} 张
            </p>
          </div>

          <div className="min-w-0 flex-1">
            <input
              ref={rangeRef}
              type="range"
              min={0}
              max={1000}
              value={Math.round(frac * 1000)}
              onChange={(e) => {
                const v = Number(e.target.value) / 1000
                app.setPlaybackUntil(min + v * span)
              }}
              // 拖动时暂停自动推进，避免与播放节拍互相拉扯
              onPointerDown={() => playback.playing && app.setPlaybackPlaying(false)}
              aria-label="回放时间轴"
              className="playback-range"
              style={{ '--fill': `${frac * 100}%` } as React.CSSProperties}
            />
            <div className="pointer-events-none relative mt-0.5 h-3.5">
              {ticks.map((t, i) => (
                <span
                  key={i}
                  className={cn(
                    'absolute -translate-x-1/2 text-[9px] tabular-nums leading-none text-faint',
                    i === 0 && 'translate-x-0',
                    i === ticks.length - 1 && 'translate-x-[-100%]'
                  )}
                  style={{ left: `${clamp(t.pos, 0, 100)}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => app.setPlaybackSpeed(SPEEDS[(SPEEDS.indexOf(playback.speed) + 1) % SPEEDS.length])}
            aria-label="切换回放速度"
            title="切换回放速度"
            className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-line/10 px-2.5 text-[11px] font-semibold tabular-nums text-muted transition hover:text-fg"
          >
            <Repeat size={11} />
            {playback.speed}×
          </button>

          <button
            type="button"
            onClick={app.stopPlayback}
            aria-label="退出时光回放"
            title="退出时光回放"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-line/[0.08] hover:text-fg"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
