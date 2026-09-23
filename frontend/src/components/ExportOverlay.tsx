import { Button } from 'xwang-ui'
import { useState } from 'react'
import { formatEta, formatSize, formatTimecode } from '../lib/timecode'
import type { ExportFailure, ExportResult, ExportStatus, TrimMode } from '../types'
import { CircleAlert, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from 'xwang-ui'
import { Progress } from 'xwang-ui'

interface Props {
  status: ExportStatus
  mode: TrimMode
  percent: number
  eta: number
  result: ExportResult | null
  failure: ExportFailure | null
  onCancel: () => void
  onClose: () => void
  onComplete: () => void
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
  onComplete,
  onReveal,
  onRetryExact,
}: Props) {
  const [showDetail, setShowDetail] = useState(false)

  if (status === 'idle') return null

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className="max-w-[420px]"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">导出视频</DialogTitle>
        <DialogDescription className="sr-only">查看导出进度、结果或错误，使用下方按钮继续。</DialogDescription>
        {status === 'running' && (
          <Running mode={mode} percent={percent} eta={eta} onCancel={onCancel} />
        )}
        {status === 'success' && result && (
          <Success result={result} onClose={onComplete} onReveal={onReveal} />
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
      </DialogContent>
    </Dialog>
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
      <h3 className="text-sm font-medium text-foreground">
        {mode === 'fast' ? '正在极速导出…' : '正在精准导出…'}
      </h3>

      {mode === 'fast' ? (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          复制中，通常很快完成
        </p>
      ) : (
        <>
          <Progress className="mt-3" value={Math.min(100, Math.max(0, percent))} />
          <p className="mt-2 text-xs text-muted">
            {Math.floor(percent)}%{eta > 0 ? ` · 剩余 ${formatEta(eta)}` : ''}
          </p>
        </>
      )}

      <div className="mt-5 flex justify-end">
        <Button variant="secondary"
          type="button"
          onClick={onCancel}

        >
          取消导出
        </Button>
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
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success-soft text-success ">
          <Check className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-medium text-foreground">导出完成</h3>
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
        <p className="mt-3 rounded-md bg-warning-soft px-2.5 py-2 text-xs text-foreground">
          {result.mode === 'fast'
            ? '极速模式会按附近关键帧裁剪，输出时长可能与请求范围略有差异'
            : '实际时长与所选范围略有差异'}
        </p>
      )}

      {result.warnings && result.warnings.length > 0 && (
        <p className="mt-2 text-xs text-foreground">{result.warnings.join('；')}</p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary"
          type="button"
          onClick={() => onReveal(result.outputPath)}
        >
          在文件夹中显示
        </Button>
        <Button variant="default"
          type="button"
          onClick={onClose}

        >
          完成
        </Button>
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
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-danger-soft text-danger">
          <CircleAlert className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-medium text-foreground">裁剪失败</h3>
      </div>

      <p className="mt-3 text-xs leading-5 text-foreground">{failure.message}</p>

      {failure.detail && (
        <div className="mt-3">
          <Button variant="ghost"
            type="button"
            onClick={onToggleDetail}

          >
            {showDetail ? '隐藏技术详情' : '查看技术详情'}
          </Button>
          {showDetail && (
            <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-surface-2 p-2 text-[10px]
                            leading-4 text-muted whitespace-pre-wrap">
              {failure.detail}
            </pre>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary"
          type="button"
          onClick={onClose}

        >
          关闭
        </Button>
        {mode === 'fast' && (
          <Button variant="default"
            type="button"
            onClick={onRetryExact}

          >
            改用精准模式重试
          </Button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`truncate text-foreground ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </dd>
    </div>
  )
}
