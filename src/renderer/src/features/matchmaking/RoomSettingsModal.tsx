import { usePartnerGamePreferenceStore } from '../settings/partner-game-preference.store'
import { gameForMode } from '../../../../shared/game-version'
import { HelpTooltip } from '../../components/ui/HelpTooltip'
import { ModalHeader } from '../../components/ui/ModalHeader'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { useRef, useState, type JSX, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
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
import { useHideDesktopOnlyFeatures } from '../community/links'

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
  const preferredGame = usePartnerGamePreferenceStore((state) => state.game)
  const hideDesktopOnlyFeatures = useHideDesktopOnlyFeatures()
  const close = useCustomGamesStore((state) => state.closeRoomSettings)
  const save = useCustomGamesStore((state) => state.updateRoom)
  const saving = useCustomGamesStore((state) => state.savingSettings)
  const error = useCustomGamesStore((state) => state.error)
  const enabledModes = useMatchmakingStore((state) => state.customModes)
  const [name, setName] = useState(room.name)
  const [mode, setMode] = useState<CustomGameMode>(room.mode)
  const [mapId, setMapId] = useState(room.mapId)
  const [password, setPassword] = useState('')
  const [legacyMode, setLegacyMode] = useState(room.legacyMode === true)
  const [friendlyFire, setFriendlyFire] = useState(room.friendlyFire ?? room.mode !== 'arena')
  const [customMoney, setCustomMoney] = useState((room.startingMoney ?? 800) !== 800)
  const [startingMoney, setStartingMoney] = useState(String(room.startingMoney ?? 800))
  const [customRoundTime, setCustomRoundTime] = useState(room.roundTimeMinutes != null)
  const [roundTime, setRoundTime] = useState(String(room.roundTimeMinutes ?? 2))
  const nameRef = useRef<HTMLInputElement>(null)
  const modes = CUSTOM_GAME_MODES.filter(
    (candidate) =>
      candidate === room.mode ||
      (enabledModes.includes(candidate) &&
        (!preferredGame || gameForMode(candidate) === preferredGame) &&
        (!hideDesktopOnlyFeatures || candidate !== 'cs13_3v3'))
  )
  const selectedMode = mode
  const modeAvailable = modes.includes(mode)
  const allowsLegacyMode = mode !== 'cs13_3v3' && mode !== 'cs13_1v1'
  const allowsMoney = selectedMode !== 'ffa' && selectedMode !== 'arena'
  const allowsRoundTime = selectedMode !== 'ffa'
  const roundTimeValid =
    !allowsRoundTime ||
    !customRoundTime ||
    (roundTime.trim() !== '' &&
      Number.isFinite(Number(roundTime)) &&
      Number(roundTime) >= 1 &&
      Number(roundTime) <= 9 &&
      Math.abs(Math.round(Number(roundTime) * 100) - Number(roundTime) * 100) <= 1e-8)
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
  const selectedMapId = mapId
  const mapAvailable =
    (mode === room.mode && selectedMapId === room.mapId) ||
    availableMaps.some((map) => map.id === selectedMapId)

  return (
    <>
      <ModalDialog
        open
        vguiTitlebar={false}
        onClose={close}
        tabIndex={-1}
        className="custom-room-dialog my-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-none border border-white/20 bg-neutral-950 outline-none"
        labelledBy="room-settings-title"
        describedBy="room-settings-description"
      >
        <ModalHeader
          title={t('customRoom.settings')}
          titleId="room-settings-title"
          description={t('customRoom.description')}
          descriptionId="room-settings-description"
          closeLabel={t('customRoom.close')}
          busy={saving}
          onClose={close}
        />

        <form
          className="grid gap-5 p-6"
          onSubmit={(event) => {
            event.preventDefault()
            if (
              !saving &&
              !disabled &&
              modeAvailable &&
              mapAvailable &&
              moneyValid &&
              roundTimeValid
            )
              void save({
                name: name.trim(),
                mode: selectedMode,
                mapId: selectedMapId,
                friendlyFire,
                legacyMode: allowsLegacyMode && legacyMode,
                startingMoney: allowsMoney && customMoney ? Number(startingMoney) : 800,
                roundTimeMinutes: allowsRoundTime && customRoundTime ? Number(roundTime) : null,
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
                onChange={(event) => {
                  const nextMode = event.target.value as CustomGameMode
                  setMode(nextMode)
                  if (!maps.some((map) => map.id === mapId && map.customModes.includes(nextMode)))
                    setMapId(maps.find((map) => map.customModes.includes(nextMode))?.id ?? '')
                }}
              >
                {!modeAvailable && (
                  <option value={mode} disabled>
                    {t(`customRoom.mode.${mode}`)}
                  </option>
                )}
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
                {selectedMapId && !availableMaps.some((map) => map.id === selectedMapId) && (
                  <option value={selectedMapId}>{selectedMapId}</option>
                )}
                {availableMaps.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.displayName}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                className="size-4 shrink-0 rounded-none accent-sky-400"
                checked={allowsLegacyMode && legacyMode}
                disabled={saving || disabled || !allowsLegacyMode}
                onChange={(event) => setLegacyMode(event.target.checked)}
              />
              {t('customRoom.legacyMode')}
            </label>
            <HelpTooltip text={t('customRoom.legacyModeHint')} />
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
          {allowsRoundTime && (
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 rounded-none accent-sky-400"
                  checked={customRoundTime}
                  disabled={saving}
                  onChange={(event) => setCustomRoundTime(event.target.checked)}
                />
                {t('customRoom.customRoundTime')}
              </label>
              <Field label={t('customRoom.roundTime')}>
                <input
                  type="number"
                  className={fieldClass}
                  min={1}
                  max={9}
                  step={0.01}
                  required={customRoundTime}
                  disabled={saving || !customRoundTime}
                  value={customRoundTime ? roundTime : ''}
                  onChange={(event) => setRoundTime(event.target.value)}
                  aria-describedby="room-round-time-hint"
                />
              </Field>
              <p id="room-round-time-hint" className="min-h-5 text-xs text-neutral-400">
                {t('customRoom.roundTimeHint')}
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
                disabled ||
                saving ||
                !modeAvailable ||
                !mapAvailable ||
                !moneyValid ||
                !roundTimeValid ||
                name.trim().length < 3
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
