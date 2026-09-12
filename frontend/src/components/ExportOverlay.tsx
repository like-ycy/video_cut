import { useState } from 'react'
import { formatEta, formatSize, formatTimecode } from '../lib/timecode'
import type { ExportFailure, ExportResult, ExportStatus, TrimMode } from '../types'
import { AlertIcon, CheckIcon } from './icons'

interface Props {
  status: ExportStatus
  mode: TrimMode
  percent: number
  eta: number
  result: ExportResult | null
  failure: ExportFailure | null
  onCancel: () => void
  onClose: () => void
  onReveal: (path: string) => void
  onRetryExact: () => void
}

/** 导出过程中的遮罩层：忙碌 / 进度 / 成功 / 失败。 */
export default function ExportOverlay({
  status,
  mode,
  percent,
  eta,
  result,
  failure,
  onCancel,
  onClose,
  onReveal,
  onRetryExact,
}: Props) {
  const [showDetail, setShowDetail] = useState(false)

  if (status === 'idle') return null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="w-[420px] rounded-lg border border-app-border bg-app-surface p-5 shadow-lg">
        {status === 'running' && (
          <Running mode={mode} percent={percent} eta={eta} onCancel={onCancel} />
        )}
        {status === 'success' && result && (
          <Success result={result} onClose={onClose} onReveal={onReveal} />
        )}
        {status === 'failed' && failure && (
          <Failed
            failure={failure}
            mode={mode}
            showDetail={showDetail}
            onToggleDetail={() => setShowDetail((v) => !v)}
            onClose={onClose}
            onRetryExact={onRetryExact}
          />
        )}
      </div>
    </div>
  )
}

function Running({
  mode,
  percent,
  eta,
  onCancel,
}: {
  mode: TrimMode
  percent: number
  eta: number
  onCancel: () => void
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-app-text">
        {mode === 'fast' ? '正在极速导出…' : '正在精准导出…'}
      </h3>

      {mode === 'fast' ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-app-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          复制中，通常很快完成
        </p>
      ) : (
        <>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-600 transition-[width] duration-200"
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-app-muted">
            {Math.floor(percent)}%{eta > 0 ? ` · 剩余 ${formatEta(eta)}` : ''}
          </p>
        </>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-app-border px-3 py-1.5 text-xs text-app-text
                     hover:bg-app-subtle transition-colors"
        >
          取消导出
        </button>
      </div>
    </div>
  )
}

function Success({
  result,
  onClose,
  onReveal,
}: {
  result: ExportResult
  onClose: () => void
  onReveal: (path: string) => void
}) {
  const drifted =
    Math.abs(result.actualDuration - (result.requestedEnd - result.requestedStart)) > 0.6

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <CheckIcon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-medium text-app-text">导出完成</h3>
      </div>

      <dl className="mt-4 space-y-2 text-xs">
        <Row label="输出文件" value={result.outputName} mono />
        <Row
          label="请求范围"
          value={`${formatTimecode(result.requestedStart)} — ${formatTimecode(result.requestedEnd)}`}
          mono
        />
        <Row label="输出时长" value={formatTimecode(result.actualDuration)} mono />
        <Row label="文件大小" value={formatSize(result.sizeBytes)} />
      </dl>

      {drifted && (
        <p className="mt-3 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
          {result.mode === 'fast'
            ? '极速模式会按附近关键帧裁剪，输出时长可能与请求范围略有差异'
            : '实际时长与所选范围略有差异'}
        </p>
      )}

      {result.warnings && result.warnings.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">{result.warnings.join('；')}</p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onReveal(result.outputPath)}
          className="rounded-md border border-app-border px-3 py-1.5 text-xs text-app-text
                     hover:bg-app-subtle transition-colors"
        >
          在文件夹中显示
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white
                     hover:bg-brand-700 transition-colors"
        >
          完成
        </button>
      </div>
    </div>
  )
}

function Failed({
  failure,
  mode,
  showDetail,
  onToggleDetail,
  onClose,
  onRetryExact,
}: {
  failure: ExportFailure
  mode: TrimMode
  showDetail: boolean
  onToggleDetail: () => void
  onClose: () => void
  onRetryExact: () => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertIcon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-medium text-app-text">裁剪失败</h3>
      </div>

      <p className="mt-3 text-xs leading-5 text-app-text">{failure.message}</p>

      {failure.detail && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onToggleDetail}
            className="text-xs text-app-muted hover:text-app-text"
          >
            {showDetail ? '隐藏技术详情' : '查看技术详情'}
          </button>
          {showDetail && (
            <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-app-subtle p-2 text-[10px]
                            leading-4 text-app-muted whitespace-pre-wrap">
              {failure.detail}
            </pre>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-app-border px-3 py-1.5 text-xs text-app-text
                     hover:bg-app-subtle transition-colors"
        >
          关闭
        </button>
        {mode === 'fast' && (
          <button
            type="button"
            onClick={onRetryExact}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white
                       hover:bg-brand-700 transition-colors"
          >
            改用精准模式重试
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-app-muted">{label}</dt>
      <dd className={`truncate text-app-text ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </dd>
    </div>
  )
}
