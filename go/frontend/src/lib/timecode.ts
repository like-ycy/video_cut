/** 时间码解析与格式化。格式为 时:分:秒，允许省略"时"。 */

/** 把秒数格式化为 HH:MM:SS。 */
export function formatTimecode(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

/** 把秒数格式化为"已保留"时长：不足 1 小时用 MM:SS，否则 HH:MM:SS。 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * 解析时间码文本。支持 "HH:MM:SS"、"MM:SS"、"SS"。
 * 非法输入返回 null。
 */
export function parseTimecode(text: string): number | null {
  const raw = text.trim()
  if (raw === '') return null

  const parts = raw.split(':')
  if (parts.length > 3) return null

  const nums: number[] = []
  for (const part of parts) {
    if (!/^\d{1,4}$/.test(part.trim())) return null
    nums.push(Number(part.trim()))
  }

  let seconds = 0
  if (nums.length === 3) {
    if (nums[1] > 59 || nums[2] > 59) return null
    seconds = nums[0] * 3600 + nums[1] * 60 + nums[2]
  } else if (nums.length === 2) {
    if (nums[1] > 59) return null
    seconds = nums[0] * 60 + nums[1]
  } else {
    seconds = nums[0]
  }
  return seconds
}

/**
 * 描述时间码解析失败的具体原因。
 * 数字形态正确但数值越界（如 99:99）时，给出"超出范围"而非笼统的格式错误。
 */
export function describeParseError(text: string): string {
  const raw = text.trim()
  if (raw === '') return '请输入时间'

  const parts = raw.split(':')
  if (parts.length > 3) return '时间格式应为 时:分:秒'

  for (const part of parts) {
    if (!/^\d{1,4}$/.test(part.trim())) return '时间格式应为 时:分:秒'
  }

  // 形态是数字，说明是分或秒超过 59
  return '分和秒需在 00 - 59 之间'
}

/** 生成人类可读的文件大小。 */
export function formatSize(bytes: number): string {
  if (bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** 生成剩余时间的简短描述。 */
export function formatEta(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `约 ${s} 秒`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return rs > 0 ? `约 ${m} 分 ${rs} 秒` : `约 ${m} 分钟`
  const h = Math.floor(m / 60)
  return `约 ${h} 小时 ${m % 60} 分`
}
