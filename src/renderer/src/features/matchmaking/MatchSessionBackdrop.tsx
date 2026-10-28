import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { twMerge } from 'tailwind-merge'

/** A transformed VGUI window contains fixed descendants. Mount the background
 * outside that window so it covers the viewport, including behind navigation.
 */
export function MatchSessionBackdrop({
  previewUrl,
  fallbackPreviewUrl,
  className
}: {
  previewUrl?: string | null
  fallbackPreviewUrl?: string
  className?: string
}): JSX.Element {
  return createPortal(
    <div
      data-match-backdrop=""
      className={twMerge(
        'pointer-events-none fixed inset-0 z-0 overflow-hidden bg-neutral-950',
        className
      )}
      aria-hidden="true"
    >
      {previewUrl && (
        <img
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-[6px]"
          src={previewUrl}
          alt=""
          onError={(event) => {
            event.currentTarget.onerror = null
            if (fallbackPreviewUrl && event.currentTarget.src !== fallbackPreviewUrl) {
              event.currentTarget.src = fallbackPreviewUrl
            } else {
              event.currentTarget.hidden = true
            }
          }}
        />
      )}
      <div className="absolute inset-0 bg-black/55" />
      <div className="match-ambient-glow absolute -inset-1/4" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_10%,rgba(0,0,0,0.65)_100%)]" />
    </div>,
    document.body
  )
}
