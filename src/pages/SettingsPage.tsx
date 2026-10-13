import { useEffect, useRef, useState } from 'react'
import { Check, Database, Download, HardDriveDownload, Loader2, MapPinned, Monitor, Moon, Palette, RefreshCw, ShieldAlert, Sun, Trash2, Upload } from 'lucide-react'
import { useApp } from '@/state/app'
import { ViewOverlay } from '@/components/layout/ViewOverlay'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/useTheme'
import { exportBackup, importBackup, type BackupProgress } from '@/lib/backup'
import { drainPendingEnrichment, migrateCnCityGroups } from '@/lib/import'
import { db } from '@/lib/db'
import { formatBytes, cn } from '@/lib/utils'

// 版本号由 vite.config.ts 构建时注入（主版本 + 构建时间，每次构建自动更新）
const APP_VERSION = __APP_VERSION__

export function SettingsPage() {
  const app = useApp()
  const theme = useTheme()
  const restoreRef = useRef<HTMLInputElement>(null)
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean>(false)
  const [busy, setBusy] = useState<'export' | 'restore' | null>(null)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [enriching, setEnriching] = useState(false)

  const refreshEstimate = async () => {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate()
      setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 })
    }
    if (navigator.storage?.persisted) setPersisted(await navigator.storage.persisted())
  }

  useEffect(() => {
    void refreshEstimate()
  }, [app.photos.length])

  const requestPersist = async () => {
    if (navigator.storage?.persist) {
      setPersisted(await navigator.storage.persist())
      await refreshEstimate()
    }
  }

  const doExport = async () => {
    setBusy('export')
    setProgress({ phase: 'packing', percent: 0, detail: '准备备份…' })
    try {
      await exportBackup((p) => setProgress(p))
      app.toast('备份已下载', '请把 .zip 备份文件保存在安全的地方', 'success')
    } catch (err) {
      app.toast('备份失败', err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const doRestore = async (file: File) => {
    if (!window.confirm('恢复会把备份中的照片合并进当前数据库（重复照片自动跳过），确定继续吗？')) return
    setBusy('restore')
    setProgress({ phase: 'reading', percent: 0, detail: '读取备份…' })
    try {
      const r = await importBackup(file, (p) => setProgress(p))
      app.toast('恢复完成', `新增 ${r.added} 张 · 跳过重复 ${r.skipped} 张${r.failed.length ? ` · 失败 ${r.failed.length} 张` : ''}`, r.failed.length ? 'error' : 'success')
    } catch (err) {
      app.toast('恢复失败', err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const retryEnrich = async () => {
    setEnriching(true)
    try {
      await drainPendingEnrichment()
      app.toast('地理信息补充完成')
    } finally {
      setEnriching(false)
    }
  }

  // 手动触发城市归档迁移（区/乡镇级 → 地级市）；网络不可用时静默提示
  const [migrating, setMigrating] = useState(false)
  const migrateCities = async () => {
    setMigrating(true)
    try {
      const fixed = await migrateCnCityGroups()
      app.toast(
        fixed > 0 ? `已为 ${fixed} 张照片重新归档城市` : '地理服务暂不可用',
        fixed > 0 ? '地图标记已按地级市重新归组' : '请稍后网络恢复后再试',
        fixed > 0 ? 'success' : 'error'
      )
    } finally {
      setMigrating(false)
    }
  }

  const wipe = async () => {
    const n = app.photos.length
    if (!window.confirm(`将永久删除全部 ${n} 张照片、旅行与元数据，且无法恢复（除非你有备份）。继续？`)) return
    if (!window.confirm('最后一次确认：真的要清空 Footprints 的全部本地数据吗？')) return
    await db.delete()
    window.location.reload()
  }

  const usagePct = estimate ? Math.min(100, (estimate.usage / Math.max(1, estimate.quota)) * 100) : 0

  return (
    <ViewOverlay title="设置" eyebrow="Settings">
      <div className="mx-auto max-w-3xl space-y-12 pb-4">
        {/* 外观 */}
        <Section icon={<Palette size={16} />} title="外观">
          <div className="grid grid-cols-3 gap-3">
            <ThemeOption active={theme.pref === 'dark'} onClick={() => theme.setPref('dark')} icon={<Moon size={18} />} label="深色" />
            <ThemeOption active={theme.pref === 'light'} onClick={() => theme.setPref('light')} icon={<Sun size={18} />} label="浅色" />
            <ThemeOption active={theme.pref === 'system'} onClick={() => theme.setPref('system')} icon={<Monitor size={18} />} label="跟随系统" />
          </div>
        </Section>

        {/* 存储 */}
        <Section icon={<Database size={16} />} title="本地存储">
          {estimate ? (
            <div className="rounded-2xl border border-line/[0.08] bg-elevated/40 p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-fg">{formatBytes(estimate.usage)}</p>
                <p className="text-xs text-faint">浏览器配额约 {formatBytes(estimate.quota)}</p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line/10">
                <div className={cn('h-full rounded-full', usagePct > 85 ? 'bg-danger' : 'bg-accent')} style={{ width: `${usagePct}%` }} />
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
                包含照片原件、压缩图、缩略图与元数据。照片较多时配额可能紧张，请定期导出备份。
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">当前浏览器无法提供存储用量信息。</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={requestPersist} disabled={persisted}>
              {persisted ? <Check size={14} /> : <HardDriveDownload size={14} />}
              {persisted ? '已获得持久存储许可' : '请求持久存储'}
            </Button>
            <Button variant="secondary" size="sm" onClick={retryEnrich} disabled={enriching}>
              {enriching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              补充缺失的地名信息
            </Button>
            {app.pendingPhotos.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('footprints:pending'))}>
                {app.pendingPhotos.length} 张照片待定位
              </Button>
            )}
            {app.cityLegacyPhotos.length > 0 && (
              <Button variant="secondary" size="sm" onClick={migrateCities} disabled={migrating}>
                {migrating ? <Loader2 size={14} className="animate-spin" /> : <MapPinned size={14} />}
                为 {app.cityLegacyPhotos.length} 张照片重新归档城市
              </Button>
            )}
          </div>
        </Section>

        {/* 备份恢复 */}
        <Section icon={<Download size={16} />} title="备份与恢复">
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={doExport} disabled={busy !== null} className="rounded-2xl border border-line/[0.08] bg-elevated/40 p-5 text-left transition hover:border-accent/40 disabled:opacity-60">
              <Upload size={20} className="rotate-180 text-accent" />
              <p className="mt-3 text-sm font-medium text-fg">导出完整备份</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">生成包含全部照片原件与元数据的 .zip 文件。</p>
            </button>
            <button onClick={() => restoreRef.current?.click()} disabled={busy !== null} className="rounded-2xl border border-line/[0.08] bg-elevated/40 p-5 text-left transition hover:border-accent/40 disabled:opacity-60">
              <Download size={20} className="text-accent" />
              <p className="mt-3 text-sm font-medium text-fg">从备份恢复</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">选择之前导出的 .zip，重复照片会自动跳过。</p>
            </button>
          </div>
          {busy && progress && (
            <div className="mt-4 rounded-2xl border border-line/[0.08] bg-elevated/40 p-4">
              <div className="flex items-center gap-2 text-sm text-fg">
                <Loader2 size={14} className="animate-spin text-accent" />
                {busy === 'export' ? '正在导出' : '正在恢复'} · {progress.percent}%
              </div>
              <p className="mt-1 text-xs text-muted">{progress.detail}</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-line/10">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          )}
          <input ref={restoreRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doRestore(f); e.target.value = '' }} />

          <div className="mt-4 flex gap-2.5 rounded-2xl border border-warning/20 bg-warning/[0.06] p-4">
            <ShieldAlert size={17} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-xs leading-relaxed text-muted">
              所有数据仅保存在本浏览器的 IndexedDB 中，不会上传到任何服务器。但<strong className="text-fg">清除网站数据、重装浏览器或使用系统清理工具都可能导致数据永久丢失</strong>。请把备份文件保存到电脑或云盘，并在大量导入后重新备份。
            </p>
          </div>
        </Section>

        {/* 危险操作 */}
        <Section icon={<Trash2 size={16} />} title="数据维护">
          <Button variant="danger" onClick={wipe} disabled={app.photos.length === 0}>
            <Trash2 size={15} /> 清空全部本地数据
          </Button>
        </Section>

        {/* 关于 */}
        <Section title="关于 Footprints">
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">版本</dt><dd className="text-fg">{APP_VERSION}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">架构</dt><dd className="text-fg">Local-first · IndexedDB · PWA</dd></div>
            <div className="flex justify-between gap-6"><dt className="text-muted">地图数据</dt><dd className="text-right text-fg">© OpenStreetMap · © CARTO</dd></div>
            <div className="flex justify-between gap-6"><dt className="text-muted">地名服务</dt><dd className="text-right text-fg">Nominatim（仅在解析 GPS 时调用）</dd></div>
          </dl>
        </Section>
      </div>
    </ViewOverlay>
  )
}

function Section({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-muted">
        {icon}{title}
      </h2>
      {children}
    </section>
  )
}

function ThemeOption({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl border p-5 text-sm transition',
        active ? 'border-accent bg-accent/10 text-fg' : 'border-line/[0.08] bg-elevated/40 text-muted hover:text-fg'
      )}
    >
      {icon}
      {label}
      {active && <Check size={13} className="text-accent" />}
    </button>
  )
}
