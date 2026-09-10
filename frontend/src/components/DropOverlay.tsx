import { FilmIcon } from './icons'

interface Props {
  active: boolean
  replacing: boolean
}

/**
 * 拖入文件时的全窗口提示浮层。
 * 无论当前是否有视频在预览都显示，pointer-events-none 保证不拦截原生 drop。
 */
export default function DropOverlay({ active, replacing }: Props) {
  if (!active) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-brand-600/10">
      <div
        className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-brand-600
                   bg-app-surface px-10 py-8 shadow-lg"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <FilmIcon className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-app-text">松开鼠标即可载入视频</p>
        <p className="text-xs text-app-muted">
          {replacing ? '将替换当前正在预览的视频' : '单次处理一个视频'}
        </p>
      </div>
    </div>
  )
}
