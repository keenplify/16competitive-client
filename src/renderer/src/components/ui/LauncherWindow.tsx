import { VguiScrollbar } from './VguiScrollbar'
import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { Monitor, X, type LucideIcon } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { useLauncherThemeStore } from '../../features/settings/launcher-theme.store'
import { useTranslation } from '../../features/i18n/i18n'
import { useWindowFocusStore } from '../../features/navigation/window-focus.store'

interface LauncherWindowProps {
  title: string
  icon?: LucideIcon
  children: ReactNode
  onClose?: () => void
  className?: string
  hostClassName?: string
}

/** Optional, nonmodal VGUI desktop window; modern layouts render unchanged. */
export function LauncherWindow({
  title,
  icon: Icon = Monitor,
  children,
  onClose,
  className,
  hostClassName
}: LauncherWindowProps): JSX.Element {
  const theme = useLauncherThemeStore((state) => state.theme)
  const activate = useWindowFocusStore((state) => state.activate)
  const { t } = useTranslation()
  const frame = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (theme === 'vgui2') activate('page')
  }, [activate, theme, title])

  useEffect(() => {
    const reset = (): void => setOffset({ x: 0, y: 0 })
    window.addEventListener('resize', reset)
    return () => window.removeEventListener('resize', reset)
  }, [])

  const move = (dx: number, dy: number): void => {
    const bounds = frame.current?.getBoundingClientRect()
    if (!bounds) return
    const x = Math.max(8 - bounds.left, Math.min(dx, window.innerWidth - 8 - bounds.right))
    const y = Math.max(8 - bounds.top, Math.min(dy, window.innerHeight - 8 - bounds.bottom))
    setOffset((previous) => ({ x: previous.x + x, y: previous.y + y }))
  }

  if (theme !== 'vgui2') return <>{children}</>

  return (
    <div className={twMerge('vgui-window-host', hostClassName)}>
      <div
        ref={frame}
        className={twMerge('vgui-window w-full max-w-xl', className)}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        role="region"
        aria-label={title}
        onPointerDownCapture={() => activate('page')}
        onFocusCapture={() => activate('page')}
      >
        <div className="vgui-window-titlebar">
          <button
            type="button"
            className="vgui-window-handle"
            aria-label={t('theme.moveWindow', { title })}
            title={t('theme.moveWindow', { title })}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              drag.current = { x: event.clientX, y: event.clientY }
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (!drag.current) return
              move(event.clientX - drag.current.x, event.clientY - drag.current.y)
              drag.current = { x: event.clientX, y: event.clientY }
            }}
            onLostPointerCapture={() => {
              drag.current = null
            }}
            onPointerUp={(event) => {
              drag.current = null
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            }}
            onKeyDown={(event) => {
              const directions: Record<string, [number, number]> = {
                ArrowLeft: [-16, 0],
                ArrowRight: [16, 0],
                ArrowUp: [0, -16],
                ArrowDown: [0, 16]
              }
              const direction = directions[event.key]
              if (direction) {
                event.preventDefault()
                move(...direction)
              }
              if (event.key === 'Home') setOffset({ x: 0, y: 0 })
            }}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{title}</span>
          </button>
          {onClose && (
            <button
              type="button"
              className="vgui-window-close"
              aria-label={t('icafe.close')}
              onClick={onClose}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="vgui-window-body">
          <div ref={contentRef} className="vgui-window-content">
            {children}
          </div>
          <VguiScrollbar contentRef={contentRef} />
        </div>
      </div>
    </div>
  )
}
