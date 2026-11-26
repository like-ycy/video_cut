import { Button } from 'xwang-ui'
import { useState } from 'react'
import { Film, FolderOpen } from 'lucide-react'

interface Props {
  onOpen: () => void
  dragging: boolean
}

/** 未打开视频时的空状态，支持拖放单个文件。 */
export default function EmptyState({ onOpen, dragging }: Props) {
  const [hover, setHover] = useState(false)

  return (
    <div
      onClick={onOpen}
      onDragEnter={() => setHover(true)}
      onDragLeave={() => setHover(false)}
      className={`flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-3
        rounded-lg border-2 border-dashed transition-colors
        ${hover || dragging
          ? 'border-primary bg-primary-soft '
          : 'border-border bg-surface hover:border-primary'}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Film className="h-6 w-6" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">拖入视频文件，或点击下方按钮</p>
        <p className="mt-1 text-xs text-muted">支持 MP4 / MOV / MKV 等常见格式，单次处理一个视频</p>
      </div>
      <Button size="lg"
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onOpen()
        }}

      >
        <FolderOpen className="h-4 w-4" />
        打开视频
      </Button>
    </div>
  )
}
