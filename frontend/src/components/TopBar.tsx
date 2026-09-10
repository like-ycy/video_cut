import type { MediaInfo, TrimMode } from '../types'
import { BoltIcon, FolderIcon, TargetIcon } from './icons'

interface Props {
  media: MediaInfo | null
  mode: TrimMode
  locked: boolean
  onOpen: () => void
  onModeChange: (mode: TrimMode) => void
}

/** 顶部工具栏：打开视频、当前文件名、模式切换。 */
export default function TopBar({ media, mode, locked, onOpen, onModeChange }: Props) {
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
          ? 'bg-app-surface text-brand-700 shadow-sm border border-app-border'
          : 'text-app-muted hover:text-app-text border border-transparent'}`}
    >
      {icon}
      {label}
    </button>
  )
}
