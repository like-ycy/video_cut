import type { MediaInfo, TrimMode } from '../types'
import type { ThemePreference } from '../lib/theme'
import { BoltIcon, FolderIcon, MoonIcon, SunIcon, SystemThemeIcon, TargetIcon } from './icons'

interface Props {
  media: MediaInfo | null
  mode: TrimMode
  locked: boolean
  version: string
  hasUpdate: boolean
  themePreference: ThemePreference
  themeLabel: string
  onOpen: () => void
  onClear: () => void
  onModeChange: (mode: TrimMode) => void
  onCheckUpdate: () => void
  onToggleTheme: () => void
}

/** 顶部工具栏：打开视频、当前文件名、模式切换、主题、版本信息。 */
export default function TopBar({
  media,
  mode,
  locked,
  version,
  hasUpdate,
  themePreference,
  themeLabel,
  onOpen,
  onClear,
  onModeChange,
  onCheckUpdate,
  onToggleTheme,
}: Props) {
  const ThemeIcon =
    themePreference === 'light' ? SunIcon : themePreference === 'dark' ? MoonIcon : SystemThemeIcon

  return (
    <header className="h-14 shrink-0 border-b border-app-border bg-app-surface px-4 flex items-center gap-3">
      <button
        type="button"
        onClick={onOpen}
        disabled={locked}
        className="flex items-center gap-2 rounded-md border border-app-border bg-app-surface px-3 py-1.5
                   text-sm font-medium text-app-text hover:bg-app-subtle transition-colors
                   disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <FolderIcon className="w-4 h-4 text-app-muted" />
        打开视频
      </button>

      <button
        type="button"
        onClick={onClear}
        disabled={!media || locked}
        className="rounded-md border border-app-border bg-app-surface px-3 py-1.5 text-sm font-medium
                   text-app-text hover:bg-app-subtle transition-colors
                   disabled:opacity-40 disabled:cursor-not-allowed"
      >
        清空
      </button>

      <div className="min-w-0 flex-1 flex items-baseline gap-2">
        <span className="truncate text-sm font-medium text-app-text">
          {media ? media.name : '未打开视频'}
        </span>
        {media && (
          <span className="shrink-0 text-xs text-app-muted">
            {media.width}×{media.height} · {media.videoCodec.toUpperCase()}
            {media.audioCount > 1 ? ` · ${media.audioCount} 条音轨` : ''}
          </span>
        )}
      </div>

      <div className="shrink-0 flex items-center rounded-md border border-app-border bg-app-subtle p-0.5">
        <ModeButton
          active={mode === 'fast'}
          disabled={locked}
          onClick={() => onModeChange('fast')}
          icon={<BoltIcon className="w-3.5 h-3.5" />}
          label="极速模式"
        />
        <ModeButton
          active={mode === 'exact'}
          disabled={locked}
          onClick={() => onModeChange('exact')}
          icon={<TargetIcon className="w-3.5 h-3.5" />}
          label="精准模式"
        />
      </div>

      <button
        type="button"
        onClick={onToggleTheme}
        title={`${themeLabel}（点击切换）`}
        aria-label={themeLabel}
        className="flex items-center justify-center rounded-md border border-app-border bg-app-surface
                   p-2 text-app-muted transition-colors hover:bg-app-subtle hover:text-app-text"
      >
        <ThemeIcon className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onCheckUpdate}
        title="点击检查更新"
        className="relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-app-muted hover:bg-app-subtle hover:text-app-text transition-colors"
      >
        <span>{version || '检查更新'}</span>
        {hasUpdate && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
          </span>
        )}
      </button>
    </header>
  )
}

function ModeButton({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean
  disabled: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        ${active
          ? 'bg-app-surface text-app-brand-text shadow-sm border border-app-border'
          : 'text-app-muted hover:text-app-text border border-transparent'}`}
    >
      {icon}
      {label}
    </button>
  )
}
