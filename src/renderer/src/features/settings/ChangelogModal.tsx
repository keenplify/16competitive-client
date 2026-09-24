import { useEffect, useRef, type JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import changelog from '../../../../../CHANGELOG.md?raw'
import { Button } from '../../components/ui/Button'
import { ModalPortal } from '../../components/ui/ModalPortal'

interface ChangelogModalProps {
  onClose: () => void
}

export function ChangelogModal({ onClose }: ChangelogModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <ModalPortal>
      <dialog
        ref={dialogRef}
        onClose={onClose}
        aria-labelledby="changelog-title"
        className="m-auto max-h-[85vh] w-[min(44rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-white/15 bg-neutral-900 p-0 text-white shadow-2xl backdrop:bg-neutral-950/85 open:flex"
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
          <h2 id="changelog-title" className="text-xl font-semibold">
            Changelog
          </h2>
          <Button variant="ghost" onClick={() => dialogRef.current?.close()}>
            Close
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto px-6 py-5 text-sm leading-6 text-neutral-300">
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h3 className="mb-3 text-2xl font-semibold text-white">{children}</h3>
              ),
              h2: ({ children }) => (
                <h3 className="mt-8 mb-3 border-t border-white/10 pt-6 text-lg font-semibold text-white">
                  {children}
                </h3>
              ),
              h3: ({ children }) => (
                <h4 className="mt-5 mb-2 font-semibold text-sky-300">{children}</h4>
              ),
              p: ({ children }) => <p className="my-2">{children}</p>,
              ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
              ol: ({ children }) => (
                <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
              ),
              code: ({ children }) => (
                <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs text-white">
                  {children}
                </code>
              )
            }}
          >
            {changelog}
          </ReactMarkdown>
        </div>
      </dialog>
    </ModalPortal>
  )
}
