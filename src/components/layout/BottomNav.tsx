import { BarChart3, Clock3, Map as MapIcon, Route, Settings as SettingsIcon } from 'lucide-react'
import { useApp, type ViewKey } from '@/state/app'
import { cn } from '@/lib/utils'

const ITEMS: Array<{ key: ViewKey; label: string; icon: typeof MapIcon }> = [
  { key: 'map', label: '地图', icon: MapIcon },
  { key: 'memories', label: '回忆', icon: Clock3 },
  { key: 'journeys', label: '旅行', icon: Route },
  { key: 'stats', label: '足迹', icon: BarChart3 },
  { key: 'settings', label: '设置', icon: SettingsIcon }
]

export function BottomNav() {
  const app = useApp()
  return (
    <nav className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-3">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-line/10 panel-glass px-1.5 py-1.5 shadow-float">
        {ITEMS.map(({ key, label, icon: Icon }) => {
          const active = app.view === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => app.setView(key)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-11 items-center gap-2 rounded-full px-3.5 transition-colors duration-200 sm:px-4',
                active
                  ? 'bg-accent/[0.14] text-accent'
                  : 'text-faint hover:bg-line/[0.05] hover:text-fg'
              )}
            >
              <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
              <span className={cn('hidden sm:inline', active ? 'text-xs font-semibold' : 'text-xs font-medium')}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
