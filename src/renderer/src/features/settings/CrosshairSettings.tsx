import { useEffect, useRef, useState, type JSX } from 'react'
import { toast } from 'react-toastify'
import {
  getCs2Crosshair,
  importCrosshairShareCode,
  parseCrosshairProfile,
  updateCs2Crosshair,
  upgradeCrosshairToCs2,
  type CrosshairProfile
} from '../../../../shared/crosshair'
import { Button } from '../../components/ui/Button'
import { useGameSettingsStore } from './game-settings.store'

const limits = {
  size: [1, 24],
  gap: [0, 24],
  thickness: [1, 8],
  outline: [0, 4],
  opacity: [10, 100]
} as const

const cs2Styles = [
  'Dynamic cross',
  'Dynamic circle',
  'Dynamic split cross',
  'Static circle',
  'Static cross',
  'Static cross with shot feedback',
  'Dot only',
  'Dynamic quadrant',
  'Static square',
  'Static quadrant'
]

export function CrosshairSettings(): JSX.Element {
  const saved = useGameSettingsStore((state) => state.crosshair)
  const inGameEnhancementsEnabled = useGameSettingsStore(
    (state) => state.nextClientIntegrationEnabled
  )
  return <CrosshairEditor saved={saved} enabled={inGameEnhancementsEnabled} />
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
  const [codeInput, setCodeInput] = useState(saved.shareCode ?? '')
  const pendingRef = useRef<CrosshairProfile | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  const touchedRef = useRef(false)
  const mountedRef = useRef(true)
  const flushRef = useRef<() => Promise<void>>(async () => undefined)
  const cs2 = getCs2Crosshair(profile)

  useEffect(() => {
    mountedRef.current = true
    flushRef.current = async () => {
      if (savingRef.current || !pendingRef.current) return
      const next = pendingRef.current
      pendingRef.current = null
      savingRef.current = true
      try {
        await saveProfile(parseCrosshairProfile(next))
        if (mountedRef.current && !pendingRef.current) setMessage('Saved automatically.')
      } catch (error) {
        if (mountedRef.current) {
          setMessage(error instanceof Error ? error.message : 'Could not save crosshair.')
          toast.error('Could not save crosshair.')
        }
      } finally {
        savingRef.current = false
        if (pendingRef.current) {
          timerRef.current = setTimeout(() => void flushRef.current(), 180)
        }
      }
    }
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      void flushRef.current()
    }
  }, [saveProfile])

  useEffect(() => {
    if (!touchedRef.current) {
      setProfile(saved)
      setCodeInput(saved.shareCode ?? '')
    }
  }, [saved])

  const queueSave = (next: CrosshairProfile, immediate = false): void => {
    touchedRef.current = true
    setProfile(next)
    pendingRef.current = next
    setMessage('Saving…')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flushRef.current(), immediate ? 0 : 180)
  }

  const update = <K extends keyof CrosshairProfile>(key: K, value: CrosshairProfile[K]): void => {
    queueSave({ ...profile, [key]: value })
  }

  const updateCs2 = (patch: Parameters<typeof updateCs2Crosshair>[1]): void => {
    const updated = updateCs2Crosshair(profile, patch)
    setCodeInput(updated.shareCode ?? '')
    queueSave(updated)
  }

  const importCode = (code = codeInput): void => {
    setCodeInput(code)
    try {
      const imported = importCrosshairShareCode(code)
      setCodeInput(imported.shareCode ?? '')
      queueSave(imported, true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Invalid crosshair code.')
    }
  }

  const arm = (style: React.CSSProperties, key: string): JSX.Element => (
    <span
      key={key}
      className="absolute"
      style={{
        backgroundColor: profile.color,
        opacity: cs2 ? cs2.alpha / 255 : profile.opacity / 100,
        boxShadow: cs2?.outlineMode
          ? `0 0 0 1px rgba(${cs2.outlineRed},${cs2.outlineGreen},${cs2.outlineBlue},${(cs2.outlineAlpha / 255) * (cs2.outlineMode === 2 ? 0.5 : 1)})`
          : profile.outline
            ? `0 0 0 ${profile.outline}px #080808`
            : 'none',
        ...style
      }}
    />
  )

  const scale = 2
  const gap = cs2 ? Math.max(0, cs2.gap + 2) * scale : profile.gap * scale
  const length = (cs2?.length ?? profile.size) * scale
  const thickness = Math.max(1, (cs2?.thickness ?? profile.thickness) * scale)
  const style = cs2?.style ?? 4
  const circle = style === 1 || style === 3
  const square = style === 8
  const quadrant = style === 7 || style === 9
  const dotOnly = style === 6
  return (
    <section className="mt-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
      <h3 className="text-lg font-semibold">Crosshair</h3>
      <p className="mt-1 text-sm text-neutral-400">
        Paste a CS2 or CSGO code or tune the controls. Changes save automatically for 1.6
        Competitive matches.
      </p>
      {!enabled && (
        <p className="mt-3 text-sm text-amber-300" role="status">
          Changes save automatically. Turn on In-game enhancements in General to use the crosshair
          during matches.
        </p>
      )}
      <fieldset>
        <div className="mt-5">
          <label className="block text-sm text-neutral-200" htmlFor="cs2-crosshair-code">
            CS2 / CSGO crosshair code
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="cs2-crosshair-code"
              value={codeInput}
              maxLength={64}
              onChange={(event) => setCodeInput(event.currentTarget.value)}
              onPaste={(event) => {
                event.preventDefault()
                importCode(event.clipboardData.getData('text'))
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') importCode()
              }}
              placeholder="CS… or CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx"
              className="min-w-0 flex-1 border border-white/20 bg-neutral-950 px-3 py-2 font-mono text-xs text-white"
            />
            <Button variant="ghost" onClick={() => importCode()}>
              Import code
            </Button>
            {cs2 && (
              <Button
                variant="ghost"
                onClick={() => void navigator.clipboard.writeText(profile.shareCode ?? '')}
              >
                Copy code
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Paste a CS2 or CSGO crosshair code to import and save it immediately. Older CSGO codes
            are converted to the current format.
          </p>
        </div>
        <div className="mt-5 grid gap-6 md:grid-cols-[200px_1fr]">
          <div
            className="relative h-48 overflow-hidden border border-white/10 bg-[#444]"
            aria-label="Crosshair preview"
          >
            <div className="absolute inset-0 bg-[linear-gradient(135deg,#5b6550_0%,#454b3c_50%,#776c55_100%)]" />
            <div className="absolute left-1/2 top-1/2">
              {circle &&
                arm(
                  {
                    width: 2 * (gap + length),
                    height: 2 * (gap + length),
                    left: -(gap + length),
                    top: -(gap + length),
                    border: `${thickness}px solid ${profile.color}`,
                    borderRadius: '50%',
                    background: 'transparent'
                  },
                  'circle'
                )}
              {square &&
                arm(
                  {
                    width: 2 * (gap + length),
                    height: 2 * (gap + length),
                    left: -(gap + length),
                    top: -(gap + length),
                    border: `${thickness}px solid ${profile.color}`,
                    background: 'transparent'
                  },
                  'square'
                )}
              {quadrant &&
                [-1, 1].flatMap((sx) =>
                  [-1, 1].map((sy) =>
                    arm(
                      {
                        width: length,
                        height: length,
                        left: sx < 0 ? -gap - length : gap,
                        top: sy < 0 ? -gap - length : gap,
                        borderTop: sy < 0 ? `${thickness}px solid ${profile.color}` : undefined,
                        borderBottom: sy > 0 ? `${thickness}px solid ${profile.color}` : undefined,
                        borderLeft: sx < 0 ? `${thickness}px solid ${profile.color}` : undefined,
                        borderRight: sx > 0 ? `${thickness}px solid ${profile.color}` : undefined,
                        background: 'transparent'
                      },
                      `quad-${sx}-${sy}`
                    )
                  )
                )}
              {!circle && !square && !quadrant && !dotOnly && (
                <>
                  {arm(
                    { width: length, height: thickness, left: gap, top: -thickness / 2 },
                    'right'
                  )}
                  {arm(
                    { width: length, height: thickness, right: gap, top: -thickness / 2 },
                    'left'
                  )}
                  {arm(
                    { width: thickness, height: length, top: gap, left: -thickness / 2 },
                    'down'
                  )}
                  {!cs2?.tStyleEnabled &&
                    arm(
                      { width: thickness, height: length, bottom: gap, left: -thickness / 2 },
                      'up'
                    )}
                </>
              )}
              {(dotOnly || profile.dot) &&
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
          {cs2 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-neutral-200 sm:col-span-2">
                Style
                <select
                  className="mt-1 block h-10 w-full border border-white/20 bg-neutral-950 px-2"
                  value={cs2.style}
                  onChange={(event) => updateCs2({ style: Number(event.currentTarget.value) })}
                >
                  {cs2Styles.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-200">
                Color
                <input
                  type="color"
                  className="mt-1 block h-10 w-full"
                  value={profile.color}
                  onChange={(event) => {
                    const hex = event.currentTarget.value
                    updateCs2({
                      red: parseInt(hex.slice(1, 3), 16),
                      green: parseInt(hex.slice(3, 5), 16),
                      blue: parseInt(hex.slice(5, 7), 16)
                    })
                  }}
                />
              </label>
              <label className="text-sm text-neutral-200">
                Outline color
                <input
                  type="color"
                  className="mt-1 block h-10 w-full"
                  value={`#${[cs2.outlineRed, cs2.outlineGreen, cs2.outlineBlue].map((value) => value.toString(16).padStart(2, '0')).join('')}`}
                  onChange={(event) => {
                    const hex = event.currentTarget.value
                    updateCs2({
                      outlineRed: parseInt(hex.slice(1, 3), 16),
                      outlineGreen: parseInt(hex.slice(3, 5), 16),
                      outlineBlue: parseInt(hex.slice(5, 7), 16)
                    })
                  }}
                />
              </label>
              {(
                [
                  ['length', 'Length', 0, 255],
                  ['gap', 'Gap', -128, 127],
                  ['thickness', 'Thickness', 0, 255],
                  ['alpha', 'Opacity', 0, 255]
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key} className="text-sm text-neutral-200">
                  <span className="flex justify-between">
                    <span>{label}</span>
                    <span>{cs2[key]}</span>
                  </span>
                  <input
                    type="range"
                    className="mt-2 w-full accent-sky-400"
                    min={min}
                    max={max}
                    value={cs2[key]}
                    onChange={(event) => updateCs2({ [key]: Number(event.currentTarget.value) })}
                  />
                </label>
              ))}
              <label className="text-sm text-neutral-200">
                Outline
                <select
                  className="mt-1 block h-10 w-full border border-white/20 bg-neutral-950 px-2"
                  value={cs2.outlineMode}
                  onChange={(event) =>
                    updateCs2({ outlineMode: Number(event.currentTarget.value) })
                  }
                >
                  <option value={0}>None</option>
                  <option value={1}>Full</option>
                  <option value={2}>Half</option>
                </select>
              </label>
              {(
                [
                  ['centerDotEnabled', 'Center dot'],
                  ['tStyleEnabled', 'T shape'],
                  ['followRecoil', 'Follow recoil']
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    checked={cs2[key]}
                    onChange={(event) => updateCs2({ [key]: event.currentTarget.checked })}
                  />
                  {label}
                </label>
              ))}
              <p className="text-xs text-neutral-500 sm:col-span-2">
                CS2 pixel sizes scale with the game resolution. Dynamic spread uses GoldSrc movement
                and shots. Follow recoil is saved in the share code but is not yet drawn in game.
              </p>
            </div>
          ) : (
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
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {!cs2 && (
            <Button
              variant="ghost"
              onClick={() => {
                const upgraded = upgradeCrosshairToCs2(profile)
                setCodeInput(upgraded.shareCode ?? '')
                queueSave(upgraded)
              }}
            >
              Use CS2 controls
            </Button>
          )}
        </div>
        <p className="mt-3 min-h-5 text-xs text-neutral-400" role="status">
          {message}
        </p>
      </fieldset>
    </section>
  )
}
