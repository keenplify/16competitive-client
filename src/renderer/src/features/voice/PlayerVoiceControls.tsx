import type { JSX } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import { preferenceFor, useVoicePreferencesStore } from './voice-preferences.store'
import { usePartnerSessionText } from '../partner-branding/partner-session-copy'

export function PlayerVoiceControls({
  playerId,
  username,
  className
}: {
  playerId: string
  username: string
  className?: string
}): JSX.Element {
  const text = usePartnerSessionText()
  const preference = useVoicePreferencesStore((state) => preferenceFor(state.preferences, playerId))
  const setPreference = useVoicePreferencesStore((state) => state.setPreference)
  return (
    <div className={twMerge('flex items-center gap-2', className)}>
      <button
        type="button"
        className="grid size-9 place-items-center border border-white/10 text-neutral-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-400"
        aria-label={`${text(preference.muted ? 'unmute' : 'mute')} ${username}`}
        aria-pressed={preference.muted}
        onClick={() => setPreference(playerId, { ...preference, muted: !preference.muted })}
      >
        {preference.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>
      <label className="flex items-center gap-2 text-xs text-neutral-400">
        <span className="sr-only">{`${username} · ${text('volume')}`}</span>
        <input
          aria-label={`${username} · ${text('volume')}`}
          type="range"
          min="0"
          max="100"
          value={Math.round(preference.volume * 100)}
          disabled={preference.muted}
          className="w-20 accent-sky-400 disabled:opacity-40 sm:w-24"
          onChange={(event) =>
            setPreference(playerId, { ...preference, volume: Number(event.target.value) / 100 })
          }
        />
        <span className="w-8 text-right tabular-nums">{Math.round(preference.volume * 100)}%</span>
      </label>
    </div>
  )
}
