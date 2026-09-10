import { useState } from 'react'
import { FilmIcon, FolderIcon } from './icons'

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
          ? 'border-brand-600 bg-brand-50'
          : 'border-app-border bg-app-surface hover:border-brand-500'}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-app-subtle text-app-muted">
        <FilmIcon className="h-6 w-6" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-app-text">拖入视频文件，或点击下方按钮</p>
        <p className="mt-1 text-xs text-app-muted">支持 MP4 / MOV / MKV 等常见格式，单次处理一个视频</p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onOpen()
        }}
        className="flex items-center gap-2 rounded-md bg-brand-600 px-3.5 py-2 text-sm font-medium
                   text-white hover:bg-brand-700 transition-colors"
      >
        <FolderIcon className="h-4 w-4" />
        打开视频
      </button>
    </div>
  )
}
