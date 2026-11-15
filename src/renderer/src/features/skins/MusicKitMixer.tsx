import { useEffect, useId, type JSX } from 'react'
import { Play, Square, X } from 'lucide-react'
import Select, { components, type OptionProps } from 'react-select'
import { twMerge } from 'tailwind-merge'
import {
  MUSIC_CUE_GROUPS,
  type MusicEvent,
  type MusicKit,
  type MusicTeam
} from '../../../../shared/music-kits'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'
import { ToastContainer } from 'react-toastify'
import { MUSIC_MIXER_TOAST_ID, useMusicKitsStore } from './music-kits.store'
import { musicCueLabel } from './music-cue-label'
import { useEffectiveLauncherTheme } from '../settings/use-effective-launcher-theme'

type CueOption = { value: string; label: string; kit?: MusicKit; event?: MusicEvent }

function CuePreview({ option, className }: { option: CueOption; className?: string }): JSX.Element {
  const { t } = useTranslation()
  const playing = useMusicKitsStore(
    (s) => s.playingId === option.kit?.id && s.playingEvent === option.event
  )
  return (
    <button
      type="button"
      disabled={!option.kit || !option.event}
      aria-label={`${t(playing ? 'music.stop' : 'music.preview')}: ${option.label}`}
      title={t(playing ? 'music.stop' : 'music.preview')}
      className={twMerge(
        'flex size-8 shrink-0 items-center justify-center rounded-none hover:bg-sky-300/20 focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-25',
        className
      )}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (option.kit && option.event)
          void useMusicKitsStore.getState().preview(option.kit.id, option.event)
      }}
    >
      {playing ? (
        <Square className="size-3.5" aria-hidden="true" />
      ) : (
        <Play className="size-3.5" aria-hidden="true" />
      )}
    </button>
  )
}

function CueDropdownOption(props: OptionProps<CueOption, false>): JSX.Element {
  return (
    <components.Option {...props}>
      <span className="flex min-h-8 items-center justify-between gap-2">
        <span className="min-w-0 truncate">{props.label}</span>
        {props.data.event && <CuePreview option={props.data} />}
      </span>
    </components.Option>
  )
}

function MusicCueRow({
  events,
  selected,
  kits,
  disabled
}: {
  events: readonly MusicEvent[]
  selected?: MusicKit
  kits: MusicKit[]
  disabled: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const id = useId()
  const mix = useMusicKitsStore((s) => s.snapshot?.mix)
  const first = events[0]
  const cue = mix?.cues[first]
  const preview = (kit?: MusicKit): Pick<CueOption, 'kit' | 'event'> => ({
    kit,
    event: events.find((e) => kit?.sounds[e])
  })
  const options: CueOption[] = [
    { value: '__off', label: t('music.mixOff') },
    {
      value: '__selected',
      label: t('music.mixSelected', { name: selected?.name ?? t('music.empty') }),
      ...preview(selected)
    },
    ...kits
      .filter((k) => k.id !== selected?.id && events.some((e) => k.sounds[e]))
      .map((k) => ({ value: k.id, label: k.name, ...preview(k) }))
  ]
  const value =
    options.find(
      (o) =>
        o.value ===
        (cue === null ? '__off' : cue === selected?.id ? '__selected' : (cue ?? '__selected'))
    ) ?? options[0]
  return (
    <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_2rem] items-center gap-3 border-b border-white/10 py-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {musicCueLabel(t, first, false)}
      </label>
      <Select<CueOption, false>
        inputId={id}
        options={options}
        value={value}
        isDisabled={disabled}
        isSearchable={false}
        noOptionsMessage={() => t('music.empty')}
        ariaLiveMessages={{
          guidance: () => t('music.mixKeyboard'),
          onFocus: ({ focused }) => focused?.label ?? '',
          onChange: ({ label }) => label ?? '',
          onFilter: () => ''
        }}
        menuPlacement="auto"
        maxMenuHeight={220}
        components={{ Option: CueDropdownOption }}
        onChange={(option) => {
          if (!option) return
          const current = useMusicKitsStore.getState().snapshot?.mix ?? { muted: false, cues: {} }
          const cues = { ...current.cues }
          for (const event of events) {
            if (option.value === '__selected') delete cues[event]
            else cues[event] = option.value === '__off' ? null : option.value
          }
          void useMusicKitsStore.getState().saveMix({ ...current, cues })
        }}
        unstyled
        className="min-w-0 text-sm"
        classNames={{
          control: (s) =>
            twMerge(
              'min-h-10 border border-white/25 bg-black/30 px-2 rounded-none',
              s.isFocused && 'border-sky-300',
              s.isDisabled && 'opacity-50'
            ),
          singleValue: () => 'truncate',
          valueContainer: () => 'min-w-0',
          menu: () => 'z-20 border border-white/25 bg-neutral-950 shadow-xl rounded-none',
          option: (s) =>
            twMerge(
              'cursor-pointer px-2',
              s.isFocused && 'bg-sky-300/15',
              s.isSelected && 'text-sky-300'
            ),
          dropdownIndicator: () => 'pl-2',
          menuList: () => 'p-1'
        }}
      />
      <CuePreview option={value} />
    </div>
  )
}

export function MusicKitMixer({ team }: { team: MusicTeam }): JSX.Element | null {
  const { t } = useTranslation()
  const theme = useEffectiveLauncherTheme()
  const id = useId()
  const open = useMusicKitsStore((s) => s.mixerTeam === team)
  const snapshot = useMusicKitsStore((s) => s.snapshot)
  const pending = useMusicKitsStore((s) => s.pending)
  useEffect(
    () => () => {
      if (useMusicKitsStore.getState().mixerTeam === team) useMusicKitsStore.getState().closeMixer()
    },
    [team]
  )
  const selected = snapshot?.kits.find(
    (k) => k.id === (snapshot.mix?.cues.mvp ?? snapshot.equipped[team])
  )
  const kits = snapshot?.kits.filter((k) => k.enabled && snapshot.ownedIds.includes(k.id)) ?? []
  return (
    <ModalDialog
      open={open}
      onClose={() => useMusicKitsStore.getState().closeMixer()}
      labelledBy={id}
      label={t('music.mixTitle')}
      className="max-w-2xl"
      contentClassName="p-5"
    >
      <ToastContainer
        containerId={MUSIC_MIXER_TOAST_ID}
        position="bottom-right"
        theme="dark"
        className="launcher-toast-container"
        style={{ position: 'fixed' }}
        toastStyle={{ borderRadius: 0 }}
        closeButton={false}
      />
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="text-xl font-semibold">
          {t('music.mixTitle')}
        </h2>
        {theme !== 'vgui2' && (
          <Button
            variant="ghost"
            className="size-8 p-0"
            aria-label={t('music.mixClose')}
            onClick={() => useMusicKitsStore.getState().closeMixer()}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      <p className="mt-2 text-sm text-neutral-300">{t('music.mixHelp')}</p>
      <label className="my-4 flex min-h-10 items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={!snapshot?.mix?.muted}
          disabled={pending}
          onChange={(e) => {
            void useMusicKitsStore
              .getState()
              .saveMix({ ...(snapshot?.mix ?? { cues: {} }), muted: !e.target.checked })
          }}
        />
        {t('music.audioEnabled')}
      </label>
      <div aria-busy={pending}>
        {MUSIC_CUE_GROUPS.map((events) => (
          <MusicCueRow
            key={events[0]}
            events={events}
            selected={selected}
            kits={kits}
            disabled={pending || Boolean(snapshot?.mix?.muted)}
          />
        ))}
      </div>
      <p className="mt-4 text-sm text-neutral-300">{t('music.nextMatch')}</p>
    </ModalDialog>
  )
}
