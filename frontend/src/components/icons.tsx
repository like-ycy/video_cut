/** 统一的线性图标集，风格保持一致。 */

type IconProps = { className?: string }

const base = 'shrink-0'

export function FolderIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} fill="none" stroke="currentColor" strokeWidth={1.8}
      viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  )
}

export function PlayIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  )
}

export function PauseIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} fill="currentColor" viewBox="0 0 24 24">
      <rect x="7" y="5" width="3.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
    </svg>
  )
}

export function ExportIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} fill="none" stroke="currentColor" strokeWidth={1.8}
      viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3m0 0L8 7m4-4 4 4" />
      <path d="M4 15v2a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-2" />
    </svg>
  )
}

export function BoltIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} fill="none" stroke="currentColor" strokeWidth={1.8}
      viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  )
}

export function TargetIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} fill="none" stroke="currentColor" strokeWidth={1.8}
      viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  )
}

export function AlertIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} fill="none" stroke="currentColor" strokeWidth={1.8}
      viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5m0 3.2v.3" />
    </svg>
  )
}

export function CheckIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} fill="none" stroke="currentColor" strokeWidth={2}
      viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12.5 9.5 17.5 19.5 7" />
    </svg>
  )
}

export function FilmIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} fill="none" stroke="currentColor" strokeWidth={1.6}
      viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18M3 15h18M8 5v14M16 5v14" />
    </svg>
  )
}

export function ChevronIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={`${base} ${className}`} fill="none" stroke="currentColor" strokeWidth={2}
      viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}
