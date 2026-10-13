import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** 格式化字节 */
export function formatBytes(bytes: number, digits = 1): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : digits)} ${units[i]}`
}

const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

export function ymd(ts: number): { year: number; month: number; day: number } {
  const d = new Date(ts)
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

/** 2026年1月15日 */
export function formatDate(ts: number | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/** 2026.01.15 */
export function formatDateShort(ts: number | null | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`
}

export function formatMonth(year: number, month: number): string {
  return `${year} · ${monthNames[month - 1]}`
}

/** 1月15日 – 1月17日 / 1月15日（同年自动省略） */
export function formatRange(start: number, end: number): string {
  const a = new Date(start)
  const b = new Date(end)
  const sameYear = a.getFullYear() === b.getFullYear()
  const fmt = (d: Date, withYear: boolean) =>
    `${withYear ? `${d.getFullYear()}年` : ''}${d.getMonth() + 1}月${d.getDate()}日`
  if (a.getTime() === b.getTime()) return fmt(a, true)
  if (sameYear) return `${a.getFullYear()}年${fmt(a, false)} – ${fmt(b, false)}`
  return `${fmt(a, true)} – ${fmt(b, true)}`
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** datetime-local 输入框值 */
export function toLocalInputValue(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function plural(n: number, unit: string): string {
  return `${n} ${unit}`
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
