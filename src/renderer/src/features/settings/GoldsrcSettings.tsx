import { useEffect, useId, useState } from 'react'
import { toast } from 'react-toastify'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'
import { useAuthStore } from '../auth/auth.store'
import { cvarRanges, parseGoldsrcCvars } from '../../../../shared/goldsrc-cvars'

const inputClass = 'h-10 w-full rounded-none border border-white/20 bg-neutral-950 px-3 font-mono'
const names = Object.keys(cvarRanges)

export function GoldsrcSettings() {
  const playerId = useAuthStore((state) => state.session?.player.id)
  return playerId ? <Editor key={playerId} /> : null
}

function Editor() {
  const { t } = useTranslation()
  const list = useId()
  const [profile, setProfile] = useState<Record<string, number> | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [raw, setRaw] = useState('')
  const known = names.includes(name)
  const value = Number(raw)
  let valid = known && raw.trim() !== ''
  if (valid) {
    try {
      parseGoldsrcCvars({ [name]: value })
    } catch {
      valid = false
    }
  }
  useEffect(() => {
    let active = true
    window.api.gameSettings
      .getCvars()
      .then((result) => {
        if (active) setProfile(result)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [])
  async function sync(next?: Record<string, number>) {
    setBusy(true)
    const id = toast.loading(t(next ? 'gameSetup.pending' : 'settings.cvars.loading'))
    try {
      setProfile(
        await (next ? window.api.gameSettings.saveCvars(next) : window.api.gameSettings.getCvars())
      )
      setFailed(false)
      toast.update(id, {
        render: t(next ? 'gameSetup.done' : 'settings.cvars.loaded'),
        type: 'success',
        isLoading: false,
        autoClose: 3000
      })
    } catch {
      if (!profile) setFailed(true)
      toast.update(id, {
        render: t('settings.cvars.error'),
        type: 'error',
        isLoading: false,
        autoClose: 5000
      })
    } finally {
      setBusy(false)
    }
  }
  function choose(key: string) {
    setName(key)
    if (profile && key in profile && names.includes(key)) setRaw(String(profile[key]))
  }
  return (
    <section className="space-y-3 border border-white/10 bg-neutral-900/90 p-5">
      <h3 className="text-lg font-semibold">{t('settings.cvars.title')}</h3>
      <p className="text-sm text-neutral-400">{t('settings.cvars.help')}</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
        <label>
          {t('settings.cvars.name')}
          <input
            className={inputClass}
            list={list}
            maxLength={32}
            placeholder="cl_forwardspeed"
            value={name}
            spellCheck={false}
            onChange={(event) => choose(event.target.value.toLowerCase())}
          />
        </label>
        <datalist id={list}>
          {names.map((key) => (
            <option key={key} value={key} />
          ))}
        </datalist>
        <label>
          {t('settings.cvars.value')}
          <input
            className={inputClass}
            type="number"
            step="any"
            placeholder={known ? cvarRanges[name].join(' – ') : '400'}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
          />
        </label>
        <Button
          className="h-10"
          disabled={!profile || busy || !valid}
          onClick={() => void sync({ ...profile, [name]: value })}
        >
          {t('settings.cvars.save')}
        </Button>
      </div>
      <div className="h-24 overflow-auto" aria-live="polite">
        {!profile &&
          (failed ? (
            <div>
              {t('settings.cvars.error')}{' '}
              <Button variant="secondary" disabled={busy} onClick={() => void sync()}>
                {t('settings.cvars.retry')}
              </Button>
            </div>
          ) : (
            t('settings.cvars.loading')
          ))}
        {Object.entries(profile ?? {}).map(([key, n]) => (
          <div key={key} className="flex items-center justify-between border-b border-white/10">
            <Button variant="ghost" onClick={() => choose(key)}>
              <code>
                {key} {n}
              </code>
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              aria-label={t('settings.cvars.remove') + ' ' + key}
              onClick={() => {
                const next = { ...profile }
                delete next[key]
                void sync(next)
              }}
            >
              {t('settings.cvars.remove')}
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}
