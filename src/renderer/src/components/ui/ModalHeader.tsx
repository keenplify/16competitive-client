import type { JSX } from 'react'
import { X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'

interface ModalHeaderProps {
  title: string
  titleId: string
  description: string
  descriptionId: string
  closeLabel: string
  onClose: () => void
  busy?: boolean
  className?: string
}

/** One content-owned header for both modern and VGUI dialogs. */
export function ModalHeader({
  title,
  titleId,
  description,
  descriptionId,
  closeLabel,
  onClose,
  busy = false,
  className
}: ModalHeaderProps): JSX.Element {
  return (
    <header
      className={twMerge(
        'launcher-modal-header grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-white/15 px-6 py-5',
        className
      )}
    >
      <h2 id={titleId} className="text-2xl font-semibold text-white">
        {title}
      </h2>
      <button
        type="button"
        className="launcher-modal-close grid size-9 place-items-center text-neutral-400 transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
        aria-label={closeLabel}
        disabled={busy}
        onClick={onClose}
      >
        <X className="size-5" aria-hidden="true" />
      </button>
      <p id={descriptionId} className="col-span-2 text-sm text-neutral-400">
        {description}
      </p>
    </header>
  )
}
