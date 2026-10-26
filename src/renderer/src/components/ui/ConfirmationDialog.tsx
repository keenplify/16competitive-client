import { useId, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { Button } from './Button'
import { ModalDialog } from './ModalDialog'
import { ModalHeader } from './ModalHeader'

interface ConfirmationDialogProps {
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  closeLabel: string
  onClose: () => void
  onConfirm: () => void
  busy?: boolean
  disabled?: boolean
  error?: string
  className?: string
  children?: ReactNode
}

export function ConfirmationDialog({
  title,
  description,
  cancelLabel,
  confirmLabel,
  closeLabel,
  onClose,
  onConfirm,
  busy = false,
  disabled = false,
  error,
  className,
  children
}: ConfirmationDialogProps) {
  const id = useId()
  const close = () => {
    if (!busy) onClose()
  }
  return (
    <ModalDialog
      open
      onClose={close}
      labelledBy={`${id}-title`}
      describedBy={`${id}-description`}
      vguiTitlebar={false}
      className={twMerge('confirmation-dialog max-w-md', className)}
    >
      <ModalHeader
        title={title}
        titleId={`${id}-title`}
        description={description}
        descriptionId={`${id}-description`}
        closeLabel={closeLabel}
        onClose={close}
        busy={busy}
      />
      <div className="confirmation-dialog-body px-6 pt-4 pb-5">
        {children}
        <div className="relative mt-2 h-10" role="status" aria-live="polite">
          {error && (
            <p className="absolute inset-0 overflow-y-auto text-sm leading-5 text-rose-300">
              {error}
            </p>
          )}
        </div>
        <div className="confirmation-dialog-actions mt-2 flex justify-end gap-2">
          <Button
            autoFocus
            variant="secondary"
            className="min-w-24"
            disabled={busy}
            onClick={close}
          >
            {cancelLabel}
          </Button>
          <Button
            className="relative min-w-36 px-8"
            disabled={busy || disabled}
            onClick={onConfirm}
          >
            <LoaderCircle
              className={twMerge('absolute left-2 size-4 animate-spin', !busy && 'invisible')}
              aria-hidden="true"
            />
            {confirmLabel}
          </Button>
        </div>
      </div>
    </ModalDialog>
  )
}
