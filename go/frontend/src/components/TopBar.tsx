import { Button } from 'xwang-ui'
import type { MediaInfo, TrimMode } from '../types'
import type { ThemePreference } from '../lib/theme'
import { Zap, FolderOpen, Moon, Sun, Monitor, Target } from 'lucide-react'

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
    themePreference === 'light' ? Sun : themePreference === 'dark' ? Moon : Monitor

  return (
    <header className="h-14 shrink-0 border-b border-border bg-surface px-4 flex items-center gap-3">
      <Button variant="secondary"
        type="button"
        onClick={onOpen}
        disabled={locked}
        className="flex items-center gap-2"
      >
        <FolderOpen className="w-4 h-4 text-muted" />
        打开视频
      </Button>

      <Button variant="secondary"
        type="button"
        onClick={onClear}
        disabled={!media || locked}

      >
        清空
      </Button>

      <div className="min-w-0 flex-1 flex items-baseline gap-2">
        <span className="truncate text-sm font-medium text-foreground">
          {media ? media.name : '未打开视频'}
        </span>
        {media && (
          <span className="shrink-0 text-xs text-muted">
            {media.width}×{media.height} · {media.videoCodec.toUpperCase()}
            {media.audioCount > 1 ? ` · ${media.audioCount} 条音轨` : ''}
          </span>
        )}
      </div>

      <div className="shrink-0 flex items-center rounded-md border border-border bg-surface-2 p-0.5">
        <ModeButton
          active={mode === 'fast'}
          disabled={locked}
          onClick={() => onModeChange('fast')}
          icon={<Zap className="w-3.5 h-3.5" />}
          label="极速模式"
        />
        <ModeButton
          active={mode === 'exact'}
          disabled={locked}
          onClick={() => onModeChange('exact')}
          icon={<Target className="w-3.5 h-3.5" />}
          label="精准模式"
        />
      </div>

      <Button variant="secondary"
        type="button"
        size="icon"
        onClick={onToggleTheme}
        title={`${themeLabel}（点击切换）`}
        aria-label={themeLabel}
        className="flex items-center justify-center"
      >
        <ThemeIcon className="w-4 h-4" />
      </Button>

      <Button variant="ghost"
        type="button"
        onClick={onCheckUpdate}
        title="点击检查更新"
        className="relative flex items-center gap-1.5"
      >
        <span>{version || '检查更新'}</span>
        {hasUpdate && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-info" />
          </span>
        )}
      </Button>
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
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={active ? 'text-primary' : 'text-muted'}
    >
      {icon}
      {label}
    </Button>
  )
}
