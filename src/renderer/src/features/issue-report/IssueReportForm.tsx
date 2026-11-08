import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog'
import { useRef } from 'react'
import { FileCode2, LoaderCircle, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useLanguageStore } from '../i18n/i18n'
import labels from '../../../../shared/issue-report-translations.json'
import { useIssueReport } from './issue-report.store'
export function IssueReportForm() {
  const state = useIssueReport()
  const language = useLanguageStore((s) => s.language)
  const t = labels[language]
  const input = useRef<HTMLInputElement>(null)
  return (
    <section
      aria-label={t.title}
      className="w-80 max-w-[calc(100vw-2rem)] border border-cyan-300/30 bg-slate-950/95 p-3 text-left text-cyan-100 shadow-xl"
    >
      <label htmlFor="issue-description" className="mb-2 block font-medium">
        {t.description}
      </label>
      <textarea
        id="issue-description"
        disabled={state.busy}
        value={state.description}
        onChange={(e) => useIssueReport.setState({ description: e.target.value })}
        maxLength={10000}
        rows={4}
        className="w-full resize-none border border-slate-700 bg-slate-900 p-2 text-xs text-white"
        placeholder={t.placeholder}
      />
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          void state.add(files)
        }}
      />
      <Button
        variant="ghost"
        disabled={state.busy || state.images.length === 3}
        onClick={() => input.current?.click()}
      >
        {t.attach}
      </Button>
      <p className="min-h-8 text-xs text-slate-300">{t.hint}</p>
      <div className="grid h-20 grid-cols-3 gap-2">
        {state.images.map((image, index) => (
          <div key={image.id} className="relative h-20 border border-slate-700">
            <img
              src={`data:${image.mime};base64,${image.data}`}
              alt={`${t.attach} ${index + 1}`}
              className="h-full w-full object-contain"
            />
            <button
              type="button"
              disabled={state.busy}
              aria-label={`${t.remove} ${index + 1}`}
              className="absolute right-0 top-0 bg-slate-950 p-1"
              onClick={() =>
                useIssueReport.setState((s) => ({
                  images: s.images.filter((i) => i.id !== image.id)
                }))
              }
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      {state.consentOpen && (
        <ConfirmationDialog
          className="max-w-xl"
          title={t.filesInclude}
          description=""
          cancelLabel={t.filesDecline}
          confirmLabel={t.filesConfirm}
          closeLabel={t.cancel}
          busy={state.busy}
          disabled={!state.compatibilityPreview}
          error={state.consentError ? t.filesError : undefined}
          onClose={() =>
            useIssueReport.setState({ consentOpen: false, compatibilityPreview: null })
          }
          onDecline={() => state.decideCompatibility(false)}
          onConfirm={() => state.decideCompatibility(true)}
        >
          <div className="h-48 overflow-auto text-xs">
            {state.compatibilityPreview ? (
              <>
                <p>{(state.compatibilityPreview.totalBytes / 1024 / 1024).toFixed(2)} MiB</p>
                <ul>
                  {state.compatibilityPreview.files.map((file) => (
                    <li
                      key={file.path}
                      className="mt-2 flex items-center gap-3 border border-white/10 bg-white/5 px-3 py-2"
                    >
                      <FileCode2 className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white">{file.path.split('/').at(-1)}</p>
                        <p className="break-all text-slate-400">{file.path}</p>
                      </div>
                      <span className="shrink-0 tabular-nums text-slate-300">
                        {(file.size / 1024 / 1024).toFixed(2)} MiB
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{state.busy ? t.filesPreparing : t.filesError}</p>
            )}
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.rememberConsent}
              disabled={state.busy}
              onChange={(event) =>
                useIssueReport.setState({ rememberConsent: event.target.checked })
              }
            />
            {t.filesRemember}
          </label>
        </ConfirmationDialog>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button
          variant="ghost"
          disabled={state.busy}
          onClick={() => useIssueReport.setState({ open: false })}
        >
          {t.cancel}
        </Button>
        <Button disabled={state.busy} className="min-w-32" onClick={() => void state.submit()}>
          {state.busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-label={t.sending} />
          ) : (
            t.submit
          )}
        </Button>
      </div>
    </section>
  )
}
