import { useEffect, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * 新版本提示：主动轮询 Service Worker 更新（autoUpdate 模式下新 SW 安装即自动接管），
 * 检测到接管后显示「新版本已就绪」提示条，点击一键刷新加载新代码。
 * 无需再手动强刷两次。
 */
export function UpdatePrompt() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // 页面加载时已有 controller：之后的 controllerchange 即新版本接管；
    // 首次访问（无 controller）的接管是 SW 首次安装，不算更新
    let hadController = !!navigator.serviceWorker.controller

    const onChange = () => {
      if (!hadController) {
        hadController = true
        return
      }
      setReady(true)
    }
    navigator.serviceWorker.addEventListener('controllerchange', onChange)

    // 启动即检查一次，之后每分钟轮询；回到前台时立即检查
    const check = () => {
      void navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.update().catch(() => {}))
    }
    check()
    const timer = window.setInterval(check, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <AnimatePresence>
      {ready && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          className="fixed left-1/2 top-4 z-[80] -translate-x-1/2"
        >
          <div className="flex items-center gap-2.5 rounded-full panel-glass border border-accent/40 px-4 py-2 shadow-float">
            <Sparkles size={15} className="shrink-0 text-accent" />
            <span className="text-sm font-medium text-fg">新版本已就绪</span>
            <button
              onClick={() => window.location.reload()}
              className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-fg transition hover:bg-accent/90"
            >
              <RefreshCw size={12} /> 立即刷新
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
