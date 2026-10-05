import { useRef, useState, type JSX } from 'react'
import { toast } from 'react-toastify'
import { parseCrosshairProfile, type CrosshairProfile } from '../../../../shared/crosshair'
import { Button } from '../../components/ui/Button'
import { useGameSettingsStore } from './game-settings.store'

const limits = {
  size: [1, 24],
  gap: [0, 24],
  thickness: [1, 8],
  outline: [0, 4],
  opacity: [10, 100]
} as const

export function CrosshairSettings(): JSX.Element {
  const saved = useGameSettingsStore((state) => state.crosshair)
  const inGameEnhancementsEnabled = useGameSettingsStore(
    (state) => state.nextClientIntegrationEnabled
  )
  return (
    <CrosshairEditor
      key={JSON.stringify(saved)}
      saved={saved}
      enabled={inGameEnhancementsEnabled}
    />
  )
}

function CrosshairEditor({
  saved,
  enabled
}: {
  saved: CrosshairProfile
  enabled: boolean
}): JSX.Element {
  const saveProfile = useGameSettingsStore((state) => state.setCrosshair)
  const [profile, setProfile] = useState<CrosshairProfile>(saved)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const update = <K extends keyof CrosshairProfile>(key: K, value: CrosshairProfile[K]): void => {
    setProfile((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  const save = async (): Promise<void> => {
    if (!enabled) return
    setSaving(true)
    try {
      await saveProfile(parseCrosshairProfile(profile))
      setMessage('')
      toast.success('Crosshair saved. Active matches update automatically.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save crosshair.')
    } finally {
      setSaving(false)
    }
  }

  const importFile = async (file: File | undefined): Promise<void> => {
    if (!enabled || !file) return
    try {
      if (file.size > 4096) throw new Error('Crosshair file exceeds 4 KB.')
      const imported = parseCrosshairProfile(JSON.parse(await file.text()))
      setProfile(imported)
      setMessage('Crosshair imported. Save to keep it on this device.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Invalid crosshair file.')
    }
  }

  const exportFile = (): void => {
    if (!enabled) return
    const blob = new Blob([`${JSON.stringify(parseCrosshairProfile(profile), null, 2)}\n`], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = '16competitive-crosshair.json'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const arm = (style: React.CSSProperties, key: string): JSX.Element => (
    <span
      key={key}
      className="absolute"
      style={{
        backgroundColor: profile.color,
        opacity: profile.opacity / 100,
        boxShadow: profile.outline ? `0 0 0 ${profile.outline}px #080808` : 'none',
        ...style
      }}
    />
  )

  const scale = 2
  const gap = profile.gap * scale
  const length = profile.size * scale
  const thickness = profile.thickness * scale
  return (
    <section className="mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
      <h3 className="text-lg font-semibold">Crosshair</h3>
      <p className="mt-1 text-sm text-neutral-400">
        Design a crosshair and share it as a JSON file. Save changes while playing to update the
        in-game crosshair.
      </p>
      {!enabled && (
        <p className="mt-3 text-sm text-amber-300" role="status">
          Turn on In-game enhancements in General to edit your crosshair.
        </p>
      )}
      <fieldset disabled={!enabled} className={!enabled ? 'opacity-40' : undefined}>
        <div className="mt-5 grid gap-6 md:grid-cols-[200px_1fr]">
          <div
            className="relative h-48 overflow-hidden border border-white/10 bg-[#444]"
            aria-label="Crosshair preview"
          >
            <div className="absolute inset-0 bg-[linear-gradient(135deg,#5b6550_0%,#454b3c_50%,#776c55_100%)]" />
            <div className="absolute left-1/2 top-1/2">
              {arm({ width: length, height: thickness, left: gap, top: -thickness / 2 }, 'right')}
              {arm({ width: length, height: thickness, right: gap, top: -thickness / 2 }, 'left')}
              {arm({ width: thickness, height: length, top: gap, left: -thickness / 2 }, 'down')}
              {arm({ width: thickness, height: length, bottom: gap, left: -thickness / 2 }, 'up')}
              {profile.dot &&
                arm(
                  {
                    width: thickness,
                    height: thickness,
                    left: -thickness / 2,
                    top: -thickness / 2
                  },
                  'dot'
                )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-neutral-200">
              Color
              <input
                type="color"
                className="mt-1 block h-10 w-full"
                value={profile.color}
                onChange={(event) => update('color', event.currentTarget.value.toUpperCase())}
              />
            </label>
            {Object.entries(limits).map(([key, [min, max]]) => (
              <label key={key} className="text-sm text-neutral-200">
                <span className="flex justify-between">
                  <span className="capitalize">{key}</span>
                  <span>{profile[key as keyof typeof limits]}</span>
                </span>
                <input
                  type="range"
                  className="mt-2 w-full accent-sky-400"
                  min={min}
                  max={max}
                  value={profile[key as keyof typeof limits]}
                  onChange={(event) =>
                    update(key as keyof typeof limits, Number(event.currentTarget.value))
                  }
                />
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={profile.dot}
                onChange={(event) => update('dot', event.currentTarget.checked)}
              />{' '}
              Center dot
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={profile.dynamic}
                onChange={(event) => update('dynamic', event.currentTarget.checked)}
              />{' '}
              Dynamic gap
            </label>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save crosshair'}
          </Button>
          <Button variant="ghost" onClick={() => importRef.current?.click()}>
            Import JSON
          </Button>
          <Button variant="ghost" onClick={exportFile}>
            Export JSON
          </Button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              void importFile(event.currentTarget.files?.[0])
              event.currentTarget.value = ''
            }}
          />
        </div>
        <p className="mt-3 min-h-5 text-xs text-neutral-400" role="status">
          {message}
        </p>
      </fieldset>
    </section>
  )
}
