import { useEffect, useRef, type JSX, type ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import { ModalPortal } from './ModalPortal'

interface ModalDialogProps {
  open: boolean
  onClose: () => void
  labelledBy: string
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
  describedBy,
  className,
  children
}: ModalDialogProps): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
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
  return (
    <ModalPortal>
      <dialog
        ref={ref}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={twMerge(
          'fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-none border border-white/15 bg-neutral-950 p-0 text-white backdrop:bg-black/80',
          className
        )}
        onCancel={(event) => {
          event.preventDefault()
          onClose()
        }}
        onKeyDown={(event) => {
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
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return
          const rect = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose()
        }}
      >
        {children}
      </dialog>
    </ModalPortal>
  )
}
