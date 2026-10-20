import {
  useEffect,
  useRef,
  type JSX,
  type ReactNode,
  type RefObject,
  type MouseEventHandler
} from 'react'
import { twMerge } from 'tailwind-merge'
import { ModalPortal } from './ModalPortal'
import { ChevronLeft, X } from 'lucide-react'
import { useLauncherThemeStore } from '../../features/settings/launcher-theme.store'
import { useTranslation } from '../../features/i18n/i18n'

interface ModalDialogProps {
  open: boolean
  onClose: () => void
  labelledBy?: string
  label?: string
  role?: 'dialog' | 'alertdialog'
  fullScreen?: boolean
  /** Disable injected VGUI chrome when the content supplies its own header. */
  vguiTitlebar?: boolean
  vguiNavigation?: { backLabel: string; onBack: () => void; onClose: () => void }
  dialogRef?: RefObject<HTMLElement | null>
  tabIndex?: number
  style?: React.CSSProperties
  onClick?: MouseEventHandler<HTMLDialogElement>
  describedBy?: string
  className?: string
  children: ReactNode
}

// Nested native dialogs share one body lock, including when all close on logout.
let bodyLockCount = 0
let savedBodyStyle: { overflow: string; paddingRight: string } | null = null
const lockBody = (): (() => void) => {
  if (bodyLockCount++ === 0) {
    savedBodyStyle = {
      overflow: document.body.style.overflow,
      paddingRight: document.body.style.paddingRight
    }
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    const padding = Number.parseFloat(getComputedStyle(document.body).paddingRight) || 0
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${padding + scrollbarWidth}px`
  }
  return () => {
    if (--bodyLockCount === 0 && savedBodyStyle) {
      document.body.style.overflow = savedBodyStyle.overflow
      document.body.style.paddingRight = savedBodyStyle.paddingRight
      savedBodyStyle = null
    }
  }
}

/** Native modal focus containment, Escape handling, and focus return on close. */
export function ModalDialog({
  open,
  onClose,
  labelledBy,
  label,
  role = 'dialog',
  fullScreen = false,
  vguiTitlebar = true,
  vguiNavigation,
  dialogRef,
  tabIndex = -1,
  style,
  onClick,
  describedBy,
  className,
  children
}: ModalDialogProps): JSX.Element | null {
  const theme = useLauncherThemeStore((state) => state.theme)
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const backdropPressed = useRef(false)
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const unlockBody = lockBody()
    dialog.showModal()
    return () => {
      dialog.close()
      unlockBody()
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    }
  }, [open])
  if (!open) return null
  return (
    <ModalPortal>
      <dialog
        ref={(element) => {
          ref.current = element
          if (dialogRef) dialogRef.current = element
        }}
        role={role}
        aria-label={label}
        tabIndex={tabIndex}
        style={style}
        data-modal-dialog
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={twMerge(
          'fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-none border border-white/15 bg-neutral-950 p-0 text-white backdrop:bg-black/80',
          fullScreen && 'm-0 h-dvh max-h-none w-screen max-w-none border-0',
          className
        )}
        onCancel={(event) => {
          event.preventDefault()
          onClose()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            return
          }
          if (event.key !== 'Tab') return
          const dialog = event.currentTarget
          const focusable = [
            ...dialog.querySelectorAll<HTMLElement>(
              'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ].filter(
            (element) =>
              element.getClientRects().length > 0 &&
              getComputedStyle(element).visibility !== 'hidden'
          )
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (!first) {
            event.preventDefault()
            dialog.focus()
            return
          }
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          backdropPressed.current =
            event.target === event.currentTarget &&
            (event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom)
        }}
        onClick={(event) => {
          if (backdropPressed.current && event.target === event.currentTarget) onClose()
          else onClick?.(event)
          backdropPressed.current = false
        }}
      >
        {theme === 'vgui2' && vguiTitlebar && (
          <div className="vgui-window-titlebar vgui-modal-titlebar">
            {vguiNavigation && (
              <button
                type="button"
                className="vgui-window-close"
                aria-label={vguiNavigation.backLabel}
                title={vguiNavigation.backLabel}
                onClick={vguiNavigation.onBack}
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
              </button>
            )}
            <span className="min-w-0 flex-1 truncate text-xs">{label ?? '1.6 Competitive'}</span>
            <button
              type="button"
              className="vgui-window-close"
              aria-label={t('icafe.close')}
              onClick={vguiNavigation?.onClose ?? onClose}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        {children}
      </dialog>
    </ModalPortal>
  )
}
