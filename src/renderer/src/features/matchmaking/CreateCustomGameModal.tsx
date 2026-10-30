import { ModalDialog } from '../../components/ui/ModalDialog'
import { useState, type FormEvent, type JSX } from 'react'
import { LoaderCircle } from 'lucide-react'
import { ModalHeader } from '../../components/ui/ModalHeader'
import { CUSTOM_GAME_MODES, type CustomGameMode } from '../../../../shared/custom-games'
import type { MatchmakingMap } from '../../../../shared/matchmaking'
import { Button } from '../../components/ui/Button'
import { FindMatchButton } from './FindMatchButton'
import { useCustomGamesStore } from './custom-games.store'
import { useMatchmakingStore } from './matchmaking.store'
import { useTranslation } from '../i18n/i18n'

interface CreateCustomGameModalProps {
  maps: MatchmakingMap[]
  selectedNodeId: string | null
  disabled?: boolean
}

const fieldClass =
  'h-11 w-full border border-white/15 bg-black/45 px-3 text-sm text-white outline-none transition focus:border-sky-400'

export function CreateCustomGameModal({
  maps,
  selectedNodeId,
  disabled = false
}: CreateCustomGameModalProps): JSX.Element {
  const { t } = useTranslation()
  const enabledModes = useMatchmakingStore((state) => state.customModes)
  const close = useCustomGamesStore((state) => state.closeCreateModal)
  const createRoom = useCustomGamesStore((state) => state.createRoom)
  const error = useCustomGamesStore((state) => state.error)
  const [name, setName] = useState(t('customGames.defaultName'))
  const [mode, setMode] = useState<CustomGameMode>('unrated')
  const [mapId, setMapId] = useState('de_dust2')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const availableModes = CUSTOM_GAME_MODES.filter((candidate) => enabledModes.includes(candidate))
  const selectedMode = availableModes.includes(mode) ? mode : (availableModes[0] ?? 'unrated')
  const supportedMaps = maps.filter(({ customModes }) => customModes.includes(selectedMode))
  const selectedMapId = supportedMaps.some((map) => map.id === mapId)
    ? mapId
    : (supportedMaps[0]?.id ?? '')

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (disabled || !selectedMapId || submitting) return
    setSubmitting(true)
    void createRoom({
      name: name.trim() || t('customGames.defaultName'),
      mode: selectedMode,
      mapId: selectedMapId,
      ...(password ? { password } : {})
    }).then((created) => {
      setSubmitting(false)
      if (created) close()
    })
  }

  return (
    <>
      <ModalDialog
        open
        vguiTitlebar={false}
        onClose={() => {
          if (!submitting) close()
        }}
        className="custom-room-dialog w-[calc(100%-2rem)] max-w-xl border border-white/20 bg-[#09090b] shadow-2xl outline-none"
        tabIndex={-1}
        labelledBy="create-custom-game-title"
        describedBy="create-custom-game-description"
      >
        <ModalHeader
          title={t('customGames.create')}
          titleId="create-custom-game-title"
          description={t('customGames.createDescription')}
          descriptionId="create-custom-game-description"
          closeLabel={t('icafe.close')}
          busy={submitting}
          onClose={close}
        />

        <form className="grid gap-4 p-6" onSubmit={submit}>
          <label className="grid gap-2 text-xs font-semibold tracking-wide text-neutral-300 uppercase">
            {t('customRoom.title')}
            <input
              className={fieldClass}
              value={name}
              disabled={submitting}
              maxLength={48}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-xs font-semibold tracking-wide text-neutral-300 uppercase">
              {t('customRoom.mode')}
              <select
                className={fieldClass}
                value={selectedMode}
                disabled={submitting || availableModes.length === 0}
                onChange={(event) => setMode(event.target.value as CustomGameMode)}
              >
                {availableModes.map((availableMode) => (
                  <option key={availableMode} value={availableMode}>
                    {t(`customRoom.mode.${availableMode}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs font-semibold tracking-wide text-neutral-300 uppercase">
              {t('customRoom.map')}
              <select
                className={fieldClass}
                value={selectedMapId}
                disabled={submitting || supportedMaps.length === 0}
                onChange={(event) => setMapId(event.target.value)}
              >
                {supportedMaps.length === 0 && <option value="">{t('legacy.customNoMaps')}</option>}
                {supportedMaps.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-2 text-xs font-semibold tracking-wide text-neutral-300 uppercase">
            {t('customRoom.password')}
            <input
              className={fieldClass}
              value={password}
              disabled={submitting}
              maxLength={64}
              type="password"
              autoComplete="new-password"
              placeholder={t('customRoom.optionalPassword')}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {!selectedNodeId && (
            <p className="text-sm text-neutral-400">{t('customGames.automaticHint')}</p>
          )}
          <p className="h-10 overflow-y-auto text-sm text-red-400" aria-live="polite">
            {error}
          </p>

          <footer className="mt-2 flex justify-end gap-3 border-t border-white/10 pt-5">
            <Button variant="ghost" type="button" disabled={submitting} onClick={close}>
              {t('customRoom.cancel')}
            </Button>
            <FindMatchButton
              className="h-11 min-w-36 px-4 text-sm font-semibold tracking-normal normal-case"
              aria-busy={submitting}
              type="submit"
              disabled={disabled || submitting || !selectedMapId}
            >
              <span className="absolute left-2 flex size-4 shrink-0 items-center justify-center">
                {submitting && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              </span>
              <span className="relative z-10">{t('customGames.create')}</span>
            </FindMatchButton>
          </footer>
        </form>
      </ModalDialog>
    </>
  )
}
