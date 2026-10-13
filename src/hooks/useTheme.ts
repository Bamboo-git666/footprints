import { useSyncExternalStore } from 'react'

export type ThemePref = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

const STORAGE_KEY = 'footprints:theme'

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function readPref(): ThemePref {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark'
}

function resolveTheme(p: ThemePref): ResolvedTheme {
  return p === 'system' ? systemTheme() : p
}

function applyDom(next: ResolvedTheme) {
  document.documentElement.classList.toggle('dark', next === 'dark')
  document.documentElement.style.colorScheme = next
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', next === 'dark' ? '#0a0b0d' : '#f6f4ef')
}

// 模块级单例 store：useTheme 在多处调用（App / MapView / SettingsPage），必须共享同一份状态
let pref: ThemePref = readPref()
const listeners = new Set<() => void>()

function setPref(p: ThemePref) {
  if (p === pref) return
  pref = p
  localStorage.setItem(STORAGE_KEY, p)
  applyDom(resolveTheme(p))
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (pref !== 'system') return
    applyDom(systemTheme())
    listeners.forEach((l) => l())
  })
  applyDom(resolveTheme(pref))
}

export function useTheme() {
  const current = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    () => pref
  )
  return { pref: current, resolved: resolveTheme(current), setPref }
}
