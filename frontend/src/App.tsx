import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BottomBar from './components/BottomBar'
import EmptyState from './components/EmptyState'
import ExportOverlay from './components/ExportOverlay'
import Player from './components/Player'
import ThumbTimeline from './components/ThumbTimeline'
import TimeCodeRow from './components/TimeCodeRow'
import TopBar from './components/TopBar'
import { AlertIcon } from './components/icons'
import type {
  ExportFailure,
  ExportResult,
  ExportStatus,
  MediaInfo,
  ThumbItem,
  TrimMode,
} from './types'
import {
  CancelExport,
  CurrentMediaURL,
  ExportVideo,
  OpenPath,
  OpenVideoDialog,
  RevealInFolder,
} from '../wailsjs/go/main/App'
import { EventsOn } from '../wailsjs/runtime'

const MIN_KEEP = 1

interface OpenedEvent {
  seq: number
  info: MediaInfo
}

interface PreviewReadyEvent {
  seq: number
  ready: boolean
}

interface ThumbProgressEvent {
  seq: number
  done: number
  total: number
}

interface ThumbDoneEvent {
  seq: number
  items: ThumbItem[]
  error: string
}

interface ExportStartEvent {
  seq: number
  mode: TrimMode
}

interface ExportProgressEvent {
  seq: number
  progress: { percent: number; etaSeconds: number }
}

interface ExportDoneEvent {
  seq: number
  result: ExportResult
}

interface ExportFailedEvent extends ExportFailure {
  seq: number
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const openSeqRef = useRef(0)
  const exportSeqRef = useRef(0)

  const [media, setMedia] = useState<MediaInfo | null>(null)
  const [mediaURL, setMediaURL] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [openError, setOpenError] = useState('')

  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [playhead, setPlayhead] = useState(0)
  const [mode, setMode] = useState<TrimMode>('fast')

  const [thumbs, setThumbs] = useState<ThumbItem[]>([])
  const [thumbLoading, setThumbLoading] = useState(false)

  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle')
  const [percent, setPercent] = useState(0)
  const [eta, setEta] = useState(0)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [failure, setFailure] = useState<ExportFailure | null>(null)
  const [formatError, setFormatError] = useState<{ start: string; end: string }>({ start: '', end: '' })

  const [dropActive, setDropActive] = useState(false)

  // ---- 后端事件 ----
  useEffect(() => {
    const offOpened = EventsOn('video:opened', (payload: OpenedEvent) => {
      if (!payload || typeof payload.seq !== 'number') return
      const { seq, info } = payload
      openSeqRef.current = seq
      exportSeqRef.current = 0
      setMedia(info)
      setOpenError('')
      setStart(0)
      setEnd(Math.max(MIN_KEEP, Math.floor(info.duration)))
      setPlayhead(0)
      setThumbs([])
      setThumbLoading(true)
      setExportStatus('idle')
      setResult(null)
      setFailure(null)
      setFormatError({ start: '', end: '' })
      setPreparing(info.needsProxy)
      setMediaURL('')
      CurrentMediaURL()
        .then((url) => {
          if (openSeqRef.current === seq) setMediaURL(url)
        })
        .catch(() => undefined)
    })

    const offFailed = EventsOn('video:failed', (message: string) => {
      setOpenError(message)
      setThumbLoading(false)
    })

    const offReady = EventsOn('preview:ready', (payload: PreviewReadyEvent) => {
      if (payload?.seq !== openSeqRef.current) return
      setPreparing(false)
      if (payload.ready) {
        // 重新取地址，强制 <video> 加载预览代理
        CurrentMediaURL()
          .then((url) => {
            if (openSeqRef.current === payload.seq) setMediaURL(url)
          })
          .catch(() => undefined)
      }
    })

    const offThumbProg = EventsOn('thumb:progress', (payload: ThumbProgressEvent) => {
      if (payload?.seq === openSeqRef.current) setThumbLoading(true)
    })
    const offThumbDone = EventsOn('thumb:done', (payload: ThumbDoneEvent) => {
      if (payload?.seq !== openSeqRef.current) return
      setThumbs(payload?.items ?? [])
      setThumbLoading(false)
    })

    const offStart = EventsOn('export:start', (payload: ExportStartEvent) => {
      exportSeqRef.current = payload?.seq ?? 0
    })
    const offProg = EventsOn('export:progress', (payload: ExportProgressEvent) => {
      if (payload?.seq !== exportSeqRef.current) return
      setPercent(payload.progress?.percent ?? 0)
      setEta(payload.progress?.etaSeconds ?? 0)
    })
    const offDone = EventsOn('export:done', (payload: ExportDoneEvent) => {
      if (payload?.seq !== exportSeqRef.current) return
      setResult(payload.result)
      setExportStatus('success')
    })
    const offFail = EventsOn('export:failed', (payload: ExportFailedEvent) => {
      if (payload?.seq !== exportSeqRef.current) return
      setFailure({ message: payload?.message ?? '裁剪失败', detail: payload?.detail ?? '' })
      setExportStatus('failed')
    })

    // 拖放文件（Wails 提供绝对路径）
    const offDrop = EventsOn('wails:file-drop', (_x: number, _y: number, paths: string[]) => {
      setDropActive(false)
      if (!paths || paths.length === 0) return
      if (paths.length > 1) {
        setOpenError('一次只能处理一个视频')
        return
      }
      OpenPath(paths[0]).catch(() => undefined)
    })

    const onDragOver = () => setDropActive(true)
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDropActive(false)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)

    return () => {
      offOpened?.()
      offFailed?.()
      offReady?.()
      offThumbProg?.()
      offThumbDone?.()
      offStart?.()
      offProg?.()
      offDone?.()
      offFail?.()
      offDrop?.()
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
    }
  }, [])

  // ---- 校验：唯一来源，实时计算，不额外保存派生状态 ----
  const errors = useMemo(() => {
    const es: { start: string; end: string } = { start: '', end: '' }
    if (!media) return es

    if (formatError.start) es.start = formatError.start
    else if (start < 0) es.start = '不能早于 00:00:00'
    else if (start > media.duration - MIN_KEEP) es.start = '开始时间过晚，至少保留 1 秒'

    if (formatError.end) es.end = formatError.end
    else if (end > media.duration) es.end = '不能超过视频总时长'
    else if (end - start < MIN_KEEP) es.end = '结束时间至少比开始时间晚 1 秒'
    return es
  }, [media, start, end, formatError])

  const hasError = Boolean(errors.start || errors.end)
  const kept = Math.max(0, end - start)
  const exporting = exportStatus === 'running'
  const locked = exporting

  // ---- 行为 ----
  const handleOpen = useCallback(() => {
    OpenVideoDialog().catch((e) => setOpenError(String(e)))
  }, [])

  const handleRangeChange = useCallback((s: number, e: number) => {
    setStart(s)
    setEnd(e)
  }, [])

  // 拖动手柄时预览跟随
  const handleScrub = useCallback((t: number) => {
    const v = videoRef.current
    if (v) v.currentTime = t
    setPlayhead(t)
  }, [])

  const handleFormatError = useCallback((which: 'start' | 'end', message: string | null) => {
    const next = message ?? ''
    setFormatError((prev) => (prev[which] === next ? prev : { ...prev, [which]: next }))
  }, [])

  const handleExport = useCallback(async () => {
    if (!media || hasError || exporting) return
    setPercent(0)
    setEta(0)
    setExportStatus('running')
    try {
      const started = await ExportVideo(mode, start, end)
      if (started !== 'started') {
        // 用户在保存对话框中取消了
        setExportStatus('idle')
      }
    } catch (e) {
      setFailure({ message: String(e), detail: '' })
      setExportStatus('failed')
    }
  }, [media, hasError, exporting, mode, start, end])

  const handleRetryExact = useCallback(() => {
    setMode('exact')
    setExportStatus('idle')
    setFailure(null)
  }, [])

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-app-bg text-app-text">
      <TopBar media={media} mode={mode} locked={locked} onOpen={handleOpen} onModeChange={setMode} />

      {openError && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          <AlertIcon className="h-3.5 w-3.5" />
          {openError}
          <button
            type="button"
            onClick={() => setOpenError('')}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            关闭
          </button>
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-4">
        {!media ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-3xl">
              <EmptyState onOpen={handleOpen} dragging={dropActive} />
            </div>
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <div className="w-full max-w-4xl">
                <Player
                  src={mediaURL}
                  duration={media.duration}
                  preparing={preparing}
                  videoRef={videoRef}
                  onTimeChange={setPlayhead}
                />
              </div>
            </div>

            <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
              <TimeCodeRow
                mediaSeq={openSeqRef.current}
                start={start}
                end={end}
                duration={media.duration}
                mode={mode}
                locked={locked}
                onStart={(v) => setStart(v)}
                onEnd={(v) => setEnd(v)}
                startError={errors.start}
                endError={errors.end}
                onFormatError={handleFormatError}
              />

              <ThumbTimeline
                duration={media.duration}
                start={Math.min(Math.max(start, 0), media.duration)}
                end={Math.min(Math.max(end, 0), media.duration)}
                items={thumbs}
                loading={thumbLoading}
                playhead={playhead}
                locked={locked}
                onRangeChange={handleRangeChange}
                onScrub={handleScrub}
              />
            </div>
          </>
        )}
      </main>

      <BottomBar
        kept={kept}
        canExport={Boolean(media) && !hasError}
        exporting={exporting}
        onExport={handleExport}
      />

      <ExportOverlay
        status={exportStatus}
        mode={mode}
        percent={percent}
        eta={eta}
        result={result}
        failure={failure}
        onCancel={() => CancelExport()}
        onClose={() => setExportStatus('idle')}
        onReveal={(path) => {
          RevealInFolder(path).catch(() => undefined)
        }}
        onRetryExact={handleRetryExact}
      />
    </div>
  )
}
