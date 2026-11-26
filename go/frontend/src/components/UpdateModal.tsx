import { Button } from 'xwang-ui'
import { useState } from 'react'
import { formatSize } from '../lib/timecode'
import type { UpdateInfo, UpdateProgress, UpdateState } from '../types'
import { CircleAlert, Check, Download, ExternalLink, RefreshCw } from 'lucide-react'
import { Checkbox } from 'xwang-ui'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from 'xwang-ui'
import { Progress } from 'xwang-ui'

interface Props {
  info: UpdateInfo | null
  isOpen: boolean
  status: UpdateState
  progress: UpdateProgress | null
  errorMessage: string
  onClose: () => void
  onStartDownload: (useProxy: boolean) => void
  onCancelDownload: () => void
  onApplyAndRestart: () => void
  onOpenBrowser: (url: string) => void
}

/** 统一的软件版本更新弹窗。 */
export default function UpdateModal({
  info,
  isOpen,
  status,
  progress,
  errorMessage,
  onClose,
  onStartDownload,
  onCancelDownload,
  onApplyAndRestart,
  onOpenBrowser,
}: Props) {
  const [useProxy, setUseProxy] = useState(true)

  if (!isOpen || !info) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-lg"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">应用更新</DialogTitle>
        <DialogDescription className="sr-only">查看版本更新状态，使用下方按钮下载、取消或安装更新。</DialogDescription>
        {status === 'prompt' && (
          <PromptView
            info={info}
            useProxy={useProxy}
            onToggleProxy={() => setUseProxy((v) => !v)}
            onClose={onClose}
            onStart={() => onStartDownload(useProxy)}
            onOpenBrowser={() => onOpenBrowser(info.releaseUrl || info.downloadUrl)}
          />
        )}

        {status === 'downloading' && (
          <DownloadingView
            info={info}
            progress={progress}
            onCancel={onCancelDownload}
          />
        )}

        {status === 'downloaded' && (
          <DownloadedView
            info={info}
            onClose={onClose}
            onApply={onApplyAndRestart}
          />
        )}

        {status === 'failed' && (
          <FailedView
            info={info}
            errorMessage={errorMessage}
            onRetry={() => onStartDownload(useProxy)}
            onOpenBrowser={() => onOpenBrowser(info.releaseUrl || info.downloadUrl)}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PromptView({
  info,
  useProxy,
  onToggleProxy,
  onClose,
  onStart,
  onOpenBrowser,
}: {
  info: UpdateInfo
  useProxy: boolean
  onToggleProxy: () => void
  onClose: () => void
  onStart: () => void
  onOpenBrowser: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary ">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">发现新版本</h3>
            <p className="text-xs text-muted">
              当前版本 {info.currentVersion} → <span className="font-semibold text-primary ">{info.latestVersion}</span>
            </p>
          </div>
        </div>

        {info.assetSize > 0 && (
          <span className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
            {formatSize(info.assetSize)}
          </span>
        )}
      </div>

      {info.releaseNotes && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">更新说明</span>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-2 p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap select-text">
            {info.releaseNotes}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer text-xs text-muted select-none">
        <Checkbox
          checked={useProxy}
          onCheckedChange={() => onToggleProxy()}
        />
        <span>使用国内加速代理下载（推荐国内用户勾选）</span>
      </label>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <Button variant="ghost"
          type="button"
          onClick={onOpenBrowser}
          className="flex items-center gap-1.5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          浏览器手动下载
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="secondary"
            type="button"
            onClick={onClose}

          >
            暂不更新
          </Button>
          <Button variant="default"
            type="button"
            onClick={onStart}

          >
            立即更新
          </Button>
        </div>
      </div>
    </div>
  )
}

function DownloadingView({
  info,
  progress,
  onCancel,
}: {
  info: UpdateInfo
  progress: UpdateProgress | null
  onCancel: () => void
}) {
  const percent = Math.min(100, Math.max(0, progress?.percent || 0))
  const downloaded = progress?.downloaded || 0
  const total = progress?.total || info.assetSize || 0
  const speed = progress?.speed || 0

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info-soft text-info animate-pulse">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">正在下载更新</h3>
            <p className="text-xs text-muted">{info.latestVersion} ({info.assetName || '安装包'})</p>
          </div>
        </div>
        <span className="text-sm font-semibold text-primary ">{percent.toFixed(0)}%</span>
      </div>

      <Progress value={percent} />

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {formatSize(downloaded)} / {total > 0 ? formatSize(total) : '计算中...'}
        </span>
        {speed > 0 && <span>{formatSize(speed)}/s</span>}
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button variant="secondary"
          type="button"
          onClick={onCancel}

        >
          取消下载
        </Button>
      </div>
    </div>
  )
}

function DownloadedView({
  info,
  onClose,
  onApply,
}: {
  info: UpdateInfo
  onClose: () => void
  onApply: () => void
}) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">更新已准备就绪</h3>
          <p className="text-xs text-muted">
            新版本 {info.latestVersion} 已下载完成
          </p>
        </div>
      </div>

      <p className="rounded-lg bg-success-soft/60 p-3 text-xs text-foreground border border-success/20 leading-relaxed">
        点击「立即重启」后，程序将在后台自动完成文件替换并重新拉起。当前如果正在处理视频，请先保存。
      </p>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button variant="secondary"
          type="button"
          onClick={onClose}

        >
          稍后重启
        </Button>
        <Button variant="default"
          type="button"
          onClick={onApply}
          className="flex items-center gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          立即重启并更新
        </Button>
      </div>
    </div>
  )
}

function FailedView({
  info,
  errorMessage,
  onRetry,
  onOpenBrowser,
  onClose,
}: {
  info: UpdateInfo
  errorMessage: string
  onRetry: () => void
  onOpenBrowser: () => void
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger">
          <CircleAlert className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">更新失败</h3>
          <p className="text-xs text-foreground">下载或安装过程发生错误</p>
        </div>
      </div>

      <div className="rounded-lg bg-danger-soft/60 p-3 text-xs text-foreground border border-danger/20 select-text">
        {errorMessage || '网络请求超时或连接中断，请检查网络后重试。'}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <Button variant="ghost"
          type="button"
          onClick={onOpenBrowser}
          className="flex items-center gap-1.5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          前往网页手动下载
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="secondary"
            type="button"
            onClick={onClose}

          >
            关闭
          </Button>
          <Button variant="default"
            type="button"
            onClick={onRetry}

          >
            重试
          </Button>
        </div>
      </div>
    </div>
  )
}
