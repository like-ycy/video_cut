/** 与 Go 后端结构对应的前端类型定义。 */

export interface MediaInfo {
  path: string
  name: string
  ext: string
  duration: number
  width: number
  height: number
  fps: number
  format: string
  videoCodec: string
  audioCodecs: string[]
  audioCount: number
  subtitleCount: number
  chapterCount: number
  rotation: number
  sizeBytes: number
  needsProxy: boolean
  canFastTrim: boolean
}

export interface ThumbItem {
  index: number
  time: number
  url: string
}

export interface ExportResult {
  outputPath: string
  outputName: string
  mode: 'fast' | 'exact'
  requestedStart: number
  requestedEnd: number
  actualDuration: number
  sizeBytes: number
  warnings: string[]
}

export interface ExportFailure {
  message: string
  detail: string
}

export interface ThumbProgress {
  done: number
  total: number
}

/** 导出模式：极速（流复制）与精准（重编码）。 */
export type TrimMode = 'fast' | 'exact'

/** 导出任务的展示状态。 */
export type ExportStatus = 'idle' | 'running' | 'success' | 'failed'
