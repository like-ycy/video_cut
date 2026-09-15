import { WindowSetBackgroundColour } from '../../wailsjs/runtime'

/** 主题偏好：亮色 / 暗色 / 跟随系统。 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'videocut-theme'

/** 与 style.css 中 --color-app-bg 一致，避免原生窗口闪白/闪黑。 */
const NATIVE_BG = {
  light: [248, 250, 252] as const,
  dark: [15, 23, 42] as const,
}

const darkQuery = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

export function getThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* 隐私模式等场景下忽略 */
  }
  return 'system'
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference
  return darkQuery()?.matches ? 'dark' : 'light'
}

function applyNativeBackground(resolved: ResolvedTheme) {
  try {
    // 浏览器调试环境下 runtime 可能不可用，忽略失败即可。
    const [r, g, b] = NATIVE_BG[resolved]
    WindowSetBackgroundColour(r, g, b, 1)
  } catch {
    /* ignore */
  }
}

export function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  applyNativeBackground(resolved)

  let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'color-scheme'
    document.head.appendChild(meta)
  }
  meta.content = resolved
}

export function saveThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    /* 同上 */
  }
}

export function cycleTheme(preference: ThemePreference): ThemePreference {
  if (preference === 'light') return 'dark'
  if (preference === 'dark') return 'system'
  return 'light'
}

/** 启动时立刻套用主题，减少白闪。main.tsx 也会调用一次。 */
export function initThemeFromStorage() {
  applyTheme(resolveTheme(getThemePreference()))
}
