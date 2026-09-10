import { formatDuration } from '../lib/timecode'
import { ExportIcon } from './icons'

interface Props {
  kept: number
  canExport: boolean
  exporting: boolean
  onExport: () => void
}

/** 底部操作栏：已保留时长 + 导出按钮。 */
export default function BottomBar({ kept, canExport, exporting, onExport }: Props) {
  return (
    <footer className="flex h-16 shrink-0 items-center justify-between border-t border-app-border bg-app-surface px-4">
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-app-muted">已保留</span>
        <span className="font-mono text-lg font-medium text-app-text">{formatDuration(kept)}</span>
      </div>

      <button
        type="button"
        onClick={onExport}
        disabled={!canExport || exporting}
        className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium
                   text-white transition-colors hover:bg-brand-700
                   disabled:cursor-not-allowed disabled:bg-slate-300"
        title={canExport ? '导出视频' : '请先修正时间设置'}
      >
        <ExportIcon className="h-4 w-4" />
        导出视频
      </button>
    </footer>
  )
}
