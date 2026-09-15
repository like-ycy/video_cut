import { useState } from 'react'
import { formatSize } from '../lib/timecode'
import type { UpdateInfo, UpdateProgress, UpdateState } from '../types'
import { AlertIcon, CheckIcon, DownloadIcon, ExternalLinkIcon, RefreshIcon } from './icons'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-app-border bg-app-surface p-6 shadow-2xl transition-all">
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
      </div>
    </div>
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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:text-brand-400">
            <DownloadIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-app-text">发现新版本</h3>
            <p className="text-xs text-app-muted">
              当前版本 {info.currentVersion} → <span className="font-semibold text-brand-600 dark:text-brand-400">{info.latestVersion}</span>
            </p>
          </div>
        </div>

        {info.assetSize > 0 && (
          <span className="rounded-md bg-app-subtle px-2 py-1 text-xs text-app-muted">
            {formatSize(info.assetSize)}
          </span>
        )}
      </div>

      {info.releaseNotes && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-app-muted">更新说明</span>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-app-border bg-app-subtle p-3 text-xs leading-relaxed text-app-text whitespace-pre-wrap select-text">
            {info.releaseNotes}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer text-xs text-app-muted select-none">
        <input
          type="checkbox"
          checked={useProxy}
          onChange={onToggleProxy}
          className="rounded border-app-border text-brand-600 focus:ring-brand-500"
        />
        <span>使用国内加速代理下载（推荐国内用户勾选）</span>
      </label>

      <div className="flex items-center justify-between pt-2 border-t border-app-border">
        <button
          type="button"
          onClick={onOpenBrowser}
          className="flex items-center gap-1.5 text-xs text-app-muted hover:text-app-text transition-colors"
        >
          <ExternalLinkIcon className="h-3.5 w-3.5" />
          浏览器手动下载
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-app-border px-3.5 py-1.5 text-xs font-medium text-app-muted hover:bg-app-subtle transition-colors"
          >
            暂不更新
          </button>
          <button
            type="button"
            onClick={onStart}
            className="rounded-md bg-brand-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 dark:hover:bg-brand-500 transition-colors"
          >
            立即更新
          </button>
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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-app-info-soft text-app-info animate-pulse">
            <DownloadIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-app-text">正在下载更新</h3>
            <p className="text-xs text-app-muted">{info.latestVersion} ({info.assetName || '安装包'})</p>
          </div>
        </div>
        <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">{percent.toFixed(0)}%</span>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-app-subtle">
        <div
          className="h-full bg-brand-600 dark:bg-brand-400 transition-all duration-200 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-app-muted">
        <span>
          {formatSize(downloaded)} / {total > 0 ? formatSize(total) : '计算中...'}
        </span>
        {speed > 0 && <span>{formatSize(speed)}/s</span>}
      </div>

      <div className="flex justify-end pt-2 border-t border-app-border">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-app-border px-3.5 py-1.5 text-xs font-medium text-app-muted hover:bg-app-subtle transition-colors"
        >
          取消下载
        </button>
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
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-app-ok-soft text-app-ok">
          <CheckIcon className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-app-text">更新已准备就绪</h3>
          <p className="text-xs text-app-muted">
            新版本 {info.latestVersion} 已下载完成
          </p>
        </div>
      </div>

      <p className="rounded-lg bg-app-ok-soft/60 p-3 text-xs text-app-ok-text border border-app-ok/20 leading-relaxed">
        点击「立即重启」后，程序将在后台自动完成文件替换并重新拉起。当前如果正在处理视频，请先保存。
      </p>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-app-border">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-app-border px-3.5 py-1.5 text-xs font-medium text-app-muted hover:bg-app-subtle transition-colors"
        >
          稍后重启
        </button>
        <button
          type="button"
          onClick={onApply}
          className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 dark:hover:bg-emerald-500 transition-colors"
        >
          <RefreshIcon className="h-3.5 w-3.5" />
          立即重启并更新
        </button>
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
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-app-danger-soft text-app-danger">
          <AlertIcon className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-app-text">更新失败</h3>
          <p className="text-xs text-app-danger-text">下载或安装过程发生错误</p>
        </div>
      </div>

      <div className="rounded-lg bg-app-danger-soft/60 p-3 text-xs text-app-danger-text border border-app-danger/20 select-text">
        {errorMessage || '网络请求超时或连接中断，请检查网络后重试。'}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-app-border">
        <button
          type="button"
          onClick={onOpenBrowser}
          className="flex items-center gap-1.5 text-xs text-app-muted hover:text-app-text transition-colors"
        >
          <ExternalLinkIcon className="h-3.5 w-3.5" />
          前往网页手动下载
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-app-border px-3.5 py-1.5 text-xs font-medium text-app-muted hover:bg-app-subtle transition-colors"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-brand-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 dark:hover:bg-brand-500 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    </div>
  )
}
