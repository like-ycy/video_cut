import { useEffect, useState } from 'react'
import { describeParseError, formatTimecode, parseTimecode } from '../lib/timecode'
import type { TrimMode } from '../types'
import { AlertIcon } from './icons'

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
        />
      </div>

      <p className="max-w-[420px] pt-1 text-right text-xs leading-5 text-app-muted">
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
}: {
  label: string
  value: string
  error: string
  disabled: boolean
  placeholder: string
  onChange: (v: string) => void
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-app-muted">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={`w-[104px] rounded-md border bg-app-surface px-2.5 py-1.5 font-mono text-sm
                    text-app-text outline-none transition-colors
                    disabled:bg-app-subtle disabled:text-app-muted
                    ${error
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-app-border focus:border-brand-600'}`}
      />
      {error && (
        <span className="flex items-center gap-1 text-xs text-red-600">
          <AlertIcon className="h-3 w-3" />
          {error}
        </span>
      )}
    </label>
  )
}
