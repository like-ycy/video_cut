import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { formatTimecode } from '../lib/timecode'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ThumbItem } from '../types'

interface Props {
  duration: number
  start: number
  end: number
  items: ThumbItem[]
  loading: boolean
  playhead: number
  locked: boolean
  onRangeChange: (start: number, end: number) => void
  onScrub: (time: number) => void
}

const TRACK_HEIGHT = 64
const RULER_HEIGHT = 18
const MIN_KEEP = 1 // 最短保留 1 秒

/** 缩略图时间轴：左右手柄选择保留区间，拖动轨道任意位置可预览。 */
export default function ThumbTimeline({
  duration,
  start,
  end,
  items,
  loading,
  playhead,
  locked,
  onRangeChange,
  onScrub,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)
  const [scrubbing, setScrubbing] = useState(false)

  // 跟踪轨道宽度，保证手柄定位准确
  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ratio = (t: number) => (duration > 0 && width > 0 ? (t / duration) * width : 0)
  const timeAt = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el || duration <= 0) return 0
      const rect = el.getBoundingClientRect()
      const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return Math.round(r * duration) // 吸附整秒
    },
    [duration],
  )

  // 手柄拖动：调整保留区间（吸附整秒、不可交叉），并同步预览
  const beginHandle = (side: 'start' | 'end', e: ReactPointerEvent) => {
    if (locked) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(side)
    onScrub(side === 'start' ? start : end)
  }
  const moveHandle = (side: 'start' | 'end', e: ReactPointerEvent) => {
    if (dragging !== side) return
    const t = timeAt(e.clientX)
    if (side === 'start') {
      const next = Math.max(0, Math.min(t, Math.floor(end) - MIN_KEEP))
      onRangeChange(next, end)
      onScrub(next)
    } else {
      const next = Math.min(duration, Math.max(t, Math.floor(start) + MIN_KEEP))
      onRangeChange(start, next)
      onScrub(next)
    }
  }
  const endHandle = (e: ReactPointerEvent) => {
    if (dragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
    }
    setDragging(null)
  }

  // 轨道拖动：在缩略图区域按下并拖动可直接预览（播放头跟随）
  const beginScrub = (e: ReactPointerEvent) => {
    if (locked) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setScrubbing(true)
    onScrub(timeAt(e.clientX))
  }
  const moveScrub = (e: ReactPointerEvent) => {
    if (!scrubbing) return
    onScrub(timeAt(e.clientX))
  }
  const endScrub = (e: ReactPointerEvent) => {
    if (scrubbing) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
    }
    setScrubbing(false)
  }

  const startX = ratio(start)
  const endX = ratio(end)
  const playX = ratio(playhead)
  const ticks = buildTicks(duration, width)

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        onPointerDown={beginScrub}
        onPointerMove={moveScrub}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        className="relative overflow-hidden rounded-md border border-app-border bg-slate-100 touch-none"
        style={{ height: TRACK_HEIGHT }}
      >
        {/* 缩略图 */}
        {items.length > 0 && (
          <div className="absolute inset-0 flex">
            {items.map((item) => (
              <div key={item.url} className="h-full flex-1 overflow-hidden">
                <img
                  src={item.url}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                  style={{ minWidth: 0 }}
                />
              </div>
            ))}
          </div>
        )}

        {/* 加载骨架：固定尺寸，不引起布局跳动 */}
        {loading && (
          <div className="absolute inset-0 animate-pulse bg-slate-200" />
        )}
        {!loading && items.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
            缩略图不可用，仍可通过时间码裁剪
          </div>
        )}

        {/* 未保留区域压暗 */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-slate-900/65"
          style={{ width: startX }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-slate-900/65"
          style={{ width: Math.max(0, width - endX) }}
        />

        {/* 保留区高亮边框 */}
        <div
          className="pointer-events-none absolute inset-y-0 border-y-2 border-brand-500"
          style={{ left: startX, width: Math.max(0, endX - startX) }}
        />

        {/* 播放头：与裁剪手柄视觉区分，使用白色细线 */}
        <div
          className="pointer-events-none absolute inset-y-0 w-[2px] bg-white/90"
          style={{ left: Math.max(0, playX - 1) }}
        >
          <div className="absolute -top-px left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white" />
        </div>

        {/* 左右裁剪手柄 */}
        <Handle
          x={startX}
          side="start"
          active={dragging === 'start'}
          disabled={locked}
          onPointerDown={(e) => beginHandle('start', e)}
          onPointerMove={(e) => moveHandle('start', e)}
          onPointerUp={endHandle}
        />
        <Handle
          x={endX}
          side="end"
          active={dragging === 'end'}
          disabled={locked}
          onPointerDown={(e) => beginHandle('end', e)}
          onPointerMove={(e) => moveHandle('end', e)}
          onPointerUp={endHandle}
        />
      </div>

      {/* 时间刻度 */}
      <div className="relative mt-1" style={{ height: RULER_HEIGHT }}>
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2 font-mono text-[10px] text-app-muted"
            style={{ left: ratio(t) }}
          >
            {formatTimecode(t)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** 单个裁剪手柄。 */
function Handle({
  x,
  side,
  active,
  disabled,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  x: number
  side: 'start' | 'end'
  active: boolean
  disabled: boolean
  onPointerDown: (e: ReactPointerEvent) => void
  onPointerMove: (e: ReactPointerEvent) => void
  onPointerUp: (e: ReactPointerEvent) => void
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title={side === 'start' ? '拖动调整开始时间' : '拖动调整结束时间'}
      className={`absolute inset-y-0 z-20 flex w-5 -translate-x-1/2 items-center justify-center touch-none
        ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-col-resize'}`}
      style={{ left: x }}
    >
      <div
        className={`h-full w-[6px] rounded-sm shadow-sm transition-colors
          ${active ? 'bg-brand-700' : 'bg-brand-600'}`}
      />
      <div className="pointer-events-none absolute h-3.5 w-[2px] rounded-full bg-white/90" />
    </div>
  )
}

/** 根据时长与宽度计算刻度间隔与刻度点。 */
function buildTicks(duration: number, width: number): number[] {
  if (duration <= 0 || width <= 0) return []
  const target = Math.max(2, Math.floor(width / 90)) // 每个刻度约 90px
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]
  const rough = duration / target
  let step = steps[steps.length - 1]
  for (const s of steps) {
    if (s >= rough) {
      step = s
      break
    }
  }
  const ticks: number[] = []
  for (let t = 0; t <= duration; t += step) {
    ticks.push(t)
  }
  return ticks
}
