import { ModalDialog } from '../../components/ui/ModalDialog'
import { useRef, useState, type JSX, type ReactNode } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import {
  CUSTOM_GAME_MODES,
  type CustomGameMode,
  type CustomGameRoom
} from '../../../../shared/custom-games'
import type { MatchmakingMap } from '../../../../shared/matchmaking'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'
import { useCustomGamesStore } from './custom-games.store'
import { useMatchmakingStore } from './matchmaking.store'

const fieldClass =
  'h-11 w-full min-w-0 rounded-none border border-white/20 bg-black/45 px-3 text-sm text-white outline-none transition focus:border-sky-400 disabled:opacity-50'

function Field({
  label,
  children,
  className
}: {
  label: string
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <label
      className={twMerge('grid min-w-0 gap-2 text-xs font-semibold text-neutral-300', className)}
    >
      {label}
      {children}
    </label>
  )
}

export function RoomSettingsModal({
  room,
  maps,
  disabled = false
}: {
  room: CustomGameRoom
  maps: MatchmakingMap[]
  disabled?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const close = useCustomGamesStore((state) => state.closeRoomSettings)
  const save = useCustomGamesStore((state) => state.updateRoom)
  const saving = useCustomGamesStore((state) => state.savingSettings)
  const error = useCustomGamesStore((state) => state.error)
  const enabledModes = useMatchmakingStore((state) => state.customModes)
  const [name, setName] = useState(room.name)
  const [mode, setMode] = useState<CustomGameMode>(room.mode)
  const [mapId, setMapId] = useState(room.mapId)
  const [password, setPassword] = useState('')
  const [friendlyFire, setFriendlyFire] = useState(room.friendlyFire ?? room.mode !== 'arena')
  const [customMoney, setCustomMoney] = useState((room.startingMoney ?? 800) !== 800)
  const [startingMoney, setStartingMoney] = useState(String(room.startingMoney ?? 800))
  const nameRef = useRef<HTMLInputElement>(null)
  const modes = CUSTOM_GAME_MODES.filter(
    (candidate) => candidate === room.mode || enabledModes.includes(candidate)
  )
  const selectedMode = modes.includes(mode) ? mode : room.mode
  const allowsMoney = selectedMode !== 'ffa' && selectedMode !== 'arena'
  const moneyValid =
    !allowsMoney ||
    !customMoney ||
    (Number.isInteger(Number(startingMoney)) &&
      Number(startingMoney) >= 800 &&
      Number(startingMoney) <= 16000)
  const availableMaps = maps.filter(
    (map) =>
      map.customModes.includes(selectedMode) ||
      (selectedMode === room.mode && map.id === room.mapId)
  )
  const selectedMapId = availableMaps.some((map) => map.id === mapId)
    ? mapId
    : (availableMaps[0]?.id ?? '')

  return (
    <>
      <ModalDialog
        open
        onClose={close}
        tabIndex={-1}
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-none border border-white/20 bg-neutral-950 outline-none"
        labelledBy="room-settings-title"
        describedBy="room-settings-description"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/15 px-6 py-5">
          <div>
            <h2 id="room-settings-title" className="text-xl font-semibold text-white">
              {t('customRoom.settings')}
            </h2>
            <p id="room-settings-description" className="mt-2 text-sm text-neutral-400">
              {t('customRoom.description')}
            </p>
          </div>
          <Button
            variant="ghost"
            className="size-10 shrink-0 p-0"
            aria-label={t('customRoom.close')}
            disabled={saving}
            onClick={close}
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </header>
        <form
          className="grid gap-5 p-6"
          onSubmit={(event) => {
            event.preventDefault()
            if (!saving && !disabled && selectedMapId && moneyValid)
              void save({
                name: name.trim(),
                mode: selectedMode,
                mapId: selectedMapId,
                friendlyFire,
                startingMoney: allowsMoney && customMoney ? Number(startingMoney) : 800,
                ...(password ? { password } : {})
              })
          }}
        >
          <Field label={t('customRoom.title')}>
            <input
              ref={nameRef}
              className={fieldClass}
              required
              minLength={3}
              maxLength={48}
              value={name}
              disabled={saving}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('customRoom.mode')}>
              <select
                className={fieldClass}
                value={selectedMode}
                disabled={saving}
                onChange={(event) => setMode(event.target.value as CustomGameMode)}
              >
                {modes.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {t(`customRoom.mode.${candidate}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('customRoom.map')}>
              <select
                className={fieldClass}
                value={selectedMapId}
                disabled={saving || !availableMaps.length}
                onChange={(event) => setMapId(event.target.value)}
              >
                {!availableMaps.length && <option value="">{t('legacy.customNoMaps')}</option>}
                {availableMaps.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.displayName}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                className="size-4 shrink-0 rounded-none accent-sky-400"
                checked={friendlyFire}
                disabled={saving || disabled}
                onChange={(event) => setFriendlyFire(event.target.checked)}
                aria-describedby="room-friendly-fire-hint"
              />
              {t('customRoom.friendlyFire')}
            </label>
            <p id="room-friendly-fire-hint" className="min-h-5 text-xs text-neutral-400">
              {t('customRoom.friendlyFireHint')}
            </p>
          </div>
          {allowsMoney && (
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 rounded-none accent-sky-400"
                  checked={customMoney}
                  disabled={saving}
                  onChange={(event) => setCustomMoney(event.target.checked)}
                />
                {t('customRoom.customMoney')}
              </label>
              <Field label={t('customRoom.startingMoney')}>
                <input
                  type="number"
                  className={fieldClass}
                  min={800}
                  max={16000}
                  step={1}
                  required={customMoney}
                  disabled={saving || !customMoney}
                  value={customMoney ? startingMoney : '800'}
                  onChange={(event) => setStartingMoney(event.target.value)}
                  aria-describedby="room-money-hint"
                />
              </Field>
              <p id="room-money-hint" className="min-h-5 text-xs text-neutral-400">
                {t('customRoom.moneyHint')}
              </p>
            </div>
          )}
          <div className="grid gap-2">
            <Field label={t('customRoom.password')}>
              <input
                className={fieldClass}
                value={password}
                disabled={saving}
                type="password"
                autoComplete="new-password"
                maxLength={64}
                minLength={4}
                placeholder={t(
                  room.hasPassword ? 'customRoom.replacePassword' : 'customRoom.optionalPassword'
                )}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <p className="min-h-5 text-xs text-neutral-400">
              {room.hasPassword ? t('customRoom.passwordHint') : ''}
            </p>
          </div>
          <p className="h-12 overflow-y-auto text-sm text-red-400" role="status">
            {error ? t('customRoom.saveFailed') : ''}
          </p>
          <footer className="flex justify-end gap-3 border-t border-white/10 pt-5">
            <Button variant="ghost" type="button" disabled={saving} onClick={close}>
              {t('customRoom.cancel')}
            </Button>
            <Button
              type="submit"
              className="min-w-40"
              disabled={
                disabled || saving || !selectedMapId || !moneyValid || name.trim().length < 3
              }
              aria-busy={saving}
            >
              <span className="flex size-4 items-center justify-center">
                {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              </span>
              {t('customRoom.save')}
            </Button>
          </footer>
        </form>
      </ModalDialog>
    </>
  )
}
