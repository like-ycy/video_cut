import { useCallback, useEffect, useState } from 'react'
import {
  applyTheme,
  cycleTheme,
  getThemePreference,
  resolveSystemTheme,
  resolveThemeSync,
  saveThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/theme'

const LABELS: Record<ThemePreference, string> = {
  light: '亮色模式',
  dark: '暗色模式',
  system: '跟随系统',
}

/** 亮 / 暗 / 跟随系统切换，并同步 document 与持久化。 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => getThemePreference())
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveThemeSync(getThemePreference()))

  // 偏好变化时立即应用
  useEffect(() => {
    if (preference === 'light' || preference === 'dark') {
      setResolved(preference)
      applyTheme(preference)
      saveThemePreference(preference)
      return
    }

    // system：先用同步猜测立刻出画面，再等原生结果纠正
    saveThemePreference('system')
    let cancelled = false
    const guess = resolveThemeSync('system')
    setResolved(guess)
    applyTheme(guess)

    resolveSystemTheme().then((next) => {
      if (cancelled) return
      setResolved(next)
      applyTheme(next)
    })

    return () => {
      cancelled = true
    }
  }, [preference])

  // 跟随系统：轮询原生外观 + 监听 media query，避免 WKWebView 事件不可靠
  useEffect(() => {
    if (preference !== 'system') return

    let cancelled = false

    const syncFromNative = async () => {
      const next = await resolveSystemTheme()
      if (cancelled) return
      setResolved(next)
      applyTheme(next)
    }

    void syncFromNative()
    const id = window.setInterval(() => {
      void syncFromNative()
    }, 1500)

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onMqChange = () => {
      void syncFromNative()
    }
    mq.addEventListener('change', onMqChange)

    return () => {
      cancelled = true
      window.clearInterval(id)
      mq.removeEventListener('change', onMqChange)
    }
  }, [preference])

  const setTheme = useCallback((next: ThemePreference) => setPreference(next), [])
  const toggleTheme = useCallback(() => setPreference((prev) => cycleTheme(prev)), [])

  const themeLabel =
    preference === 'system'
      ? `跟随系统（当前${LABELS[resolved]}）`
      : LABELS[preference]

  return {
    preference,
    resolved,
    themeLabel,
    setTheme,
    toggleTheme,
  }
}
