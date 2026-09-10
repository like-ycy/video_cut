import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { formatTimecode } from '../lib/timecode'
import { PauseIcon, PlayIcon } from './icons'

interface Props {
  src: string
  duration: number
  preparing: boolean
  videoRef: React.RefObject<HTMLVideoElement | null>
  onTimeChange: (time: number) => void
}

/** 视频预览区：16:9 播放器，仅保留播放/暂停与进度跳转。 */
export default function Player({ src, duration, preparing, videoRef, onTimeChange }: Props) {
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [failed, setFailed] = useState(false)
  const barRef = useRef<HTMLDivElement | null>(null)

  // 切换视频时重置播放状态
  useEffect(() => {
    setPlaying(false)
    setCurrent(0)
    setFailed(false)
  }, [src])

  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => setFailed(true))
    } else {
      v.pause()
    }
  }

  const seekTo = (clientX: number) => {
    const v = videoRef.current
    const bar = barRef.current
    if (!v || !bar || duration <= 0) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    v.currentTime = ratio * duration
    setCurrent(v.currentTime)
  }

  // 拖动进度条时预览跟随：用 pointer capture 保证拖出元素外也不丢事件
  const draggingRef = useRef(false)
  const onBarPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    seekTo(e.clientX)
  }
  const onBarPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    seekTo(e.clientX)
  }
  const onBarPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-full aspect-video bg-slate-900 rounded-lg overflow-hidden">
        {preparing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/85 text-sm text-slate-200">
            <span className="flex items-center gap-2">
              <Spinner />
              正在准备预览…
            </span>
          </div>
        )}

        {failed && !preparing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/85 px-6 text-center text-sm text-slate-200">
            该视频无法直接预览，但仍可裁剪导出
          </div>
        )}

        <video
          ref={videoRef}
          src={src}
          className="h-full w-full object-contain"
          playsInline
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime
            setCurrent(t)
            onTimeChange(t)
          }}
          onError={() => setFailed(true)}
        />
      </div>

      {/* 播放控制条 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!src || preparing}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-app-border
                     bg-app-surface text-app-text hover:bg-app-subtle
                     disabled:opacity-40 disabled:cursor-not-allowed"
          title={playing ? '暂停' : '播放'}
        >
          {playing ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
        </button>

        <span className="w-[92px] shrink-0 font-mono text-xs text-app-text">
          {formatTimecode(current)}
        </span>

        <div
          ref={barRef}
          onPointerDown={onBarPointerDown}
          onPointerMove={onBarPointerMove}
          onPointerUp={onBarPointerUp}
          onPointerCancel={onBarPointerUp}
          className="group relative h-2.5 flex-1 cursor-pointer touch-none select-none rounded-full bg-slate-200"
          title="拖动或点击跳转到指定位置"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-brand-600"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full
                       bg-brand-600 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: `${progress}%` }}
          />
        </div>

        <span className="w-[92px] shrink-0 text-right font-mono text-xs text-app-muted">
          {formatTimecode(duration)}
        </span>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2Z"
      />
    </svg>
  )
}
