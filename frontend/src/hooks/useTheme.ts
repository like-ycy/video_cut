import { useCallback, useEffect, useState } from 'react'
import {
  applyTheme,
  cycleTheme,
  getThemePreference,
  resolveTheme,
  saveThemePreference,
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
  const [resolved, setResolved] = useState(() => resolveTheme(getThemePreference()))

  useEffect(() => {
    const next = resolveTheme(preference)
    setResolved(next)
    applyTheme(next)
    saveThemePreference(preference)
  }, [preference])

  // 跟随系统时监听系统配色变化
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (getThemePreference() !== 'system') return
      const next = resolveTheme('system')
      setResolved(next)
      applyTheme(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

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
