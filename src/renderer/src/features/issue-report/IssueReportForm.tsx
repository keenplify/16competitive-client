import { useRef } from 'react'
import { LoaderCircle, X } from 'lucide-react'
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
