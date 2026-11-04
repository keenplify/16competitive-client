/* Standalone bundled Electron entry; this surface does not use Vite fast refresh. */
/* eslint-disable react-refresh/only-export-components */
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Play, Upload, LoaderCircle } from 'lucide-react'
import { SUPPORTED_LANGUAGES, useLanguageStore } from '../i18n/i18n'
import { StickerPlacementSurface } from './StickerPlacementSurface'
import { useStickerEditor } from './sticker-editor.store'
import translations from './sticker-translations.json'
import '@fontsource/rajdhani/400.css'
import '@fontsource/rajdhani/600.css'
import '@fontsource/rajdhani/700.css'
import './sticker-editor.css'
function StickerEditor() {
  const state = useStickerEditor()
  const language = useLanguageStore(s => s.language)
  const t = translations[language]
  useEffect(() => {
    document.title = t.title
  }, [t.title])
  useEffect(() => {
    void useStickerEditor.getState().run('load')
    return window.stickerEditor?.onGameExit(failed => {
      if (failed) useStickerEditor.setState({ message: 'launch' })
    })
  }, [])
  const statusKey = state.message === 'launch' ? 'launchError' : state.message
  const status = t[statusKey as keyof typeof t]
  return <main className="standalone-sticker-editor">
    <StickerPlacementSurface name="AK-47" count={0} onApply={() => void state.run('exportModel')}>
      <button disabled={state.busy} onClick={() => void state.run('importSticker')}><Upload size={16} />{t.import}</button>
      <button disabled={!state.placed || state.busy} onClick={() => void state.run('launch')}><Play size={16} />{t.launch}</button>
    </StickerPlacementSurface>
    <details className="sticker-development"><summary>{t.subtitle}</summary><p>{t.notice}</p><label>{t.language}<select value={language} onChange={e => useLanguageStore.getState().setLanguage(e.target.value as typeof language)}>{SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label><button onClick={() => void state.run('load')} disabled={state.busy}>{t.retry}</button><code>{state.output}</code></details>
    {status && <div className="editor-toast" role="status" aria-live="polite">{state.busy && <LoaderCircle size={18} className="spinner" />}{status}</div>}
  </main>
}
createRoot(document.getElementById('root')!).render(<StickerEditor />)
