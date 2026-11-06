import { useEffect, useRef, useState } from 'react'
import { describeParseError, formatTimecode, parseTimecode } from '../lib/timecode'
import type { TrimMode } from '../types'
import { CircleAlert } from 'lucide-react'
import { Input } from 'xwang-ui'
import { Label } from 'xwang-ui'

/** 时间码的三段：时、分、秒。 */
type TimeSegment = 'h' | 'm' | 's'

/** 每段对应一个刻度的秒数。 */
const SEGMENT_UNIT_SECONDS: Record<TimeSegment, number> = { h: 3600, m: 60, s: 1 }

/**
 * 滚轮灵敏度：累计 deltaY 达到该阈值才算走了一格（一格 ±1）。
 * 普通鼠标滚轮一格约 ±100，触控板的小幅滚动会累积到阈值后才生效，
 * 单次事件最多消耗 5 格，避免一次滚动直接跨越整个范围（如从 0 跳到 60）。
 */
const WHEEL_STEP_THRESHOLD = 100
const MAX_STEPS_PER_EVENT = 5

/**
 * 根据光标（caret）位置判断当前落在哪一段。
 * 点击输入框会把光标放到点击的那一段里，之后滚动只调节该段；
 * 字符 0-2 归"时"（含第一个冒号），3-5 归"分"，其余归"秒"。
 */
function segmentFromCaret(input: HTMLInputElement): TimeSegment | null {
  const pos = input.selectionStart ?? input.value.length
  if (pos <= 2) return 'h'
  if (pos <= 5) return 'm'
  return 's'
}

/**
 * 基于当前文本对指定段做增减（steps 为格数，正增负减），返回新的时间码文本。
 * maxSeconds 为视频时长上限（<=0 表示不限制）。
 *
 * - 从当前已填写值出发，通过总秒数加减实现进位/借位：
 *   如 00:00:59 加 1 秒得 00:01:00，00:21:00 减 1 分借位为 00:20:00（秒不变）。
 * - 边界下限为 0，不回绕到最大值。
 * - "时"段：结果一旦超出时长就整体不动，短视频（不足一小时）下"时"不可再增，
 *   也避免钳制到时长导致的大幅跳变。
 * - "分/秒"段：结果超出时长时钳制到时长（粘在最大值上），不会出现 12、13 分这类越界值；
 *   若当前值本就已超时长（手动输入越界），则不做调节。
 * - 文本非法（未通过校验）时返回 null，不做调节。
 */
function adjustTimecodeText(
  text: string,
  segment: TimeSegment,
  steps: number,
  maxSeconds: number,
): string | null {
  const total = parseTimecode(text)
  if (total === null) return null
  let next = total + steps * SEGMENT_UNIT_SECONDS[segment]
  if (next < 0) next = 0
  if (maxSeconds > 0 && next > maxSeconds) {
    if (segment === 'h' || total > maxSeconds) return null
    next = maxSeconds
  }
  return formatTimecode(next)
}

interface Props {
  mediaSeq: number
  start: number
  end: number
  duration: number
  mode: TrimMode
  locked: boolean
  onStart: (seconds: number) => void
  onEnd: (seconds: number) => void
  startError: string
  endError: string
  /** 输入框文本格式非法时上报，用于禁用导出按钮。 */
  onFormatError: (which: 'start' | 'end', message: string | null) => void
}

/** 时间码输入区：手动输入开始/结束时间，非法值标红并给出原因。 */
export default function TimeCodeRow({
  mediaSeq,
  start,
  end,
  duration,
  mode,
  locked,
  onStart,
  onEnd,
  startError,
  endError,
  onFormatError,
}: Props) {
  const [startText, setStartText] = useState(formatTimecode(start))
  const [endText, setEndText] = useState(formatTimecode(end))

  // 外部数值变化（拖动手柄、打开新视频）以父组件为唯一状态源。
  useEffect(() => {
    setStartText(formatTimecode(start))
    onFormatError('start', null)
  }, [mediaSeq, start, onFormatError])
  useEffect(() => {
    setEndText(formatTimecode(end))
    onFormatError('end', null)
  }, [end, mediaSeq, onFormatError])

  // 输入过程中先清除上一次的格式错误提示。
  const changeText = (which: 'start' | 'end', text: string) => {
    if (which === 'start') setStartText(text)
    else setEndText(text)
    onFormatError(which, null)
  }

  const commit = (which: 'start' | 'end', text: string) => {
    const value = parseTimecode(text)
    if (value === null) {
      // 非法值：保留原文并标红，不静默修改另一端
      const msg = describeParseError(text)
      onFormatError(which, msg)
      return
    }
    onFormatError(which, null)
    if (which === 'start') onStart(value)
    else onEnd(value)
  }

  // 滚轮调节：立即更新文本并提交（与回车/失焦提交同一通道，保持校验逻辑一致）。
  // 以视频实际时长为上限，越出视频范围的滚动不生效。
  const adjust = (which: 'start' | 'end', segment: TimeSegment, steps: number) => {
    const text = which === 'start' ? startText : endText
    const next = adjustTimecodeText(text, segment, steps, duration)
    if (next === null || next === text) return
    changeText(which, next)
    commit(which, next)
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <TimeField
          label="开始时间"
          value={startText}
          disabled={locked || duration <= 0}
          error={startError}
          placeholder="00:00:00"
          onChange={(v) => changeText('start', v)}
          onBlur={() => {
            commit('start', startText)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit('start', startText)
              e.currentTarget.blur()
            }
          }}
          onAdjust={(segment, steps) => adjust('start', segment, steps)}
        />
        <TimeField
          label="结束时间"
          value={endText}
          disabled={locked || duration <= 0}
          error={endError}
          placeholder="00:00:00"
          onChange={(v) => changeText('end', v)}
          onBlur={() => {
            commit('end', endText)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit('end', endText)
              e.currentTarget.blur()
            }
          }}
          onAdjust={(segment, steps) => adjust('end', segment, steps)}
        />
      </div>

      <p className="max-w-[420px] pt-1 text-right text-xs leading-5 text-muted">
        {mode === 'fast'
          ? '极速模式：完全无损，切点可能对齐附近关键帧，完成后显示请求范围和输出时长'
          : '精准模式：严格按所选时间裁剪，高质量重编码，耗时较长'}
      </p>
    </div>
  )
}

function TimeField({
  label,
  value,
  error,
  disabled,
  placeholder,
  onChange,
  onBlur,
  onKeyDown,
  onAdjust,
}: {
  label: string
  value: string
  error: string
  disabled: boolean
  placeholder: string
  onChange: (v: string) => void
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  /** 滚轮调节回调：segment 为点击选中的段，steps 为格数（正增负减）。 */
  onAdjust: (segment: TimeSegment, steps: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const wheelAccRef = useRef(0)
  /** 最近一次点击/移动光标时所在的段；滚轮只调节这一段。 */
  const activeSegmentRef = useRef<TimeSegment | null>(null)

  // 回调通过 ref 透传，避免每次渲染都重新绑定原生监听。
  const adjustRef = useRef(onAdjust)
  adjustRef.current = onAdjust

  // 点击时光标已落在对应段内，记录该段，之后滚动持续调节它。
  const handleClick = () => {
    const input = inputRef.current
    if (input) activeSegmentRef.current = segmentFromCaret(input)
  }

  // 键盘移动光标（方向键、输入数字等）后同步更新当前段。
  const handleKeyUp = () => {
    const input = inputRef.current
    if (input && document.activeElement === input) {
      activeSegmentRef.current = segmentFromCaret(input)
    }
  }

  useEffect(() => {
    const input = inputRef.current
    if (!input || disabled) return

    const onWheel = (e: WheelEvent) => {
      // 仅在输入框已聚焦（点击进入）时调节，且只调点击选中的那段；
      // 纯悬停滚动不响应，避免鼠标稍偏就误调到别的段。
      if (document.activeElement !== input) return
      e.preventDefault()
      const segment = activeSegmentRef.current
      if (!segment) return

      // 灵敏度控制：按累计 delta 换算格数；Firefox 的行模式按每行约 33px 折算。
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY
      wheelAccRef.current += delta
      if (Math.abs(wheelAccRef.current) < WHEEL_STEP_THRESHOLD) return

      let steps = Math.trunc(wheelAccRef.current / WHEEL_STEP_THRESHOLD)
      wheelAccRef.current -= steps * WHEEL_STEP_THRESHOLD
      steps = Math.max(-MAX_STEPS_PER_EVENT, Math.min(MAX_STEPS_PER_EVENT, steps))
      if (steps !== 0) adjustRef.current(segment, steps)
    }

    // React 的 onWheel 是 passive 的，无法 preventDefault，需手动挂非 passive 监听。
    input.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      input.removeEventListener('wheel', onWheel)
      wheelAccRef.current = 0
    }
  }, [disabled])

  return (
    <Label className="flex flex-col items-start gap-1 text-xs text-muted">
      <span className="text-xs text-muted">{label}</span>
      <Input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onClick={handleClick}
        onKeyUp={handleKeyUp}
        aria-invalid={Boolean(error)}
        className="h-8 w-[104px] font-mono text-sm"
        title="点击到时/分/秒上后滚动滚轮可调节"
      />
      {error && (
        <span className="flex items-center gap-1 text-xs text-danger">
          <CircleAlert className="h-3 w-3" />
          {error}
        </span>
      )}
    </Label>
  )
}
