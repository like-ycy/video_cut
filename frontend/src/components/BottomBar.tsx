import { Button } from '@/components/ui/button'
import { formatDuration } from '../lib/timecode'
import { Upload } from 'lucide-react'

interface Props {
  kept: number
  canExport: boolean
  exporting: boolean
  onExport: () => void
}

/** 底部操作栏：已保留时长 + 导出按钮。 */
export default function BottomBar({ kept, canExport, exporting, onExport }: Props) {
  return (
    <footer className="flex h-16 shrink-0 items-center justify-between border-t border-border bg-surface px-4">
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-muted">已保留</span>
        <span className="font-mono text-lg font-medium text-foreground">{formatDuration(kept)}</span>
      </div>

      <Button variant="default"
        type="button"
        onClick={onExport}
        disabled={!canExport || exporting}
        className="flex items-center gap-2"
        title={canExport ? '导出视频' : '请先修正时间设置'}
      >
        <Upload className="h-4 w-4" />
        导出视频
      </Button>
    </footer>
  )
}
