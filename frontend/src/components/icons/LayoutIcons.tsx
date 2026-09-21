import type { ReactNode } from 'react'

type LayoutIconProps = {
  size?: number
  className?: string
}

function LucideStroke({
  size = 18,
  className,
  children,
}: LayoutIconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

/** Lucide panel-left-close — collapse left sidebar/panel */
export function IconPanelLeftClose({ size = 18, className }: LayoutIconProps) {
  return (
    <LucideStroke size={size} className={className}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m16 15-3-3 3-3" />
    </LucideStroke>
  )
}

/** Lucide panel-left-open — expand left sidebar/panel */
export function IconPanelLeftOpen({ size = 18, className }: LayoutIconProps) {
  return (
    <LucideStroke size={size} className={className}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m14 9 3 3-3 3" />
    </LucideStroke>
  )
}

export function IconChevronDown({ size = 18, className }: LayoutIconProps) {
  return (
    <LucideStroke size={size} className={className}>
      <path d="m6 9 6 6 6-6" />
    </LucideStroke>
  )
}

export function IconChevronUp({ size = 18, className }: LayoutIconProps) {
  return (
    <LucideStroke size={size} className={className}>
      <path d="m18 15-6-6-6 6" />
    </LucideStroke>
  )
}

export function IconChevronsLeft({ size = 18, className }: LayoutIconProps) {
  return (
    <LucideStroke size={size} className={className}>
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </LucideStroke>
  )
}

export function IconMessageSquare({ size = 18, className }: LayoutIconProps) {
  return (
    <LucideStroke size={size} className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </LucideStroke>
  )
}

export function IconUsers({ size = 18, className }: LayoutIconProps) {
  return (
    <LucideStroke size={size} className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </LucideStroke>
  )
}

export function IconInbox({ size = 18, className }: LayoutIconProps) {
  return (
    <LucideStroke size={size} className={className}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </LucideStroke>
  )
}

export function IconSend({ size = 18, className }: LayoutIconProps) {
  return (
    <LucideStroke size={size} className={className}>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </LucideStroke>
  )
}

export function IconUserPlus({ size = 18, className }: LayoutIconProps) {
  return (
    <LucideStroke size={size} className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" x2="19" y1="8" y2="14" />
      <line x1="22" x2="16" y1="11" y2="11" />
    </LucideStroke>
  )
}

export function IconPlus({ size = 18, className }: LayoutIconProps) {
  return (
    <LucideStroke size={size} className={className}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </LucideStroke>
  )
}

export function IconBuilding2({ size = 18, className }: LayoutIconProps) {
  return (
    <LucideStroke size={size} className={className}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </LucideStroke>
  )
}

export function IconListTree({ size = 18, className }: LayoutIconProps) {
  return (
    <LucideStroke size={size} className={className}>
      <path d="M21 12h-8" />
      <path d="M21 6H8" />
      <path d="M21 18h-8" />
      <path d="M3 6v4c0 1.1.9 2 2 2h3" />
      <path d="M3 14v4c0 1.1.9 2 2 2h3" />
    </LucideStroke>
  )
}
