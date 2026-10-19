import type { JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { PromptCard } from '../../components/ui/PromptCard'
import { useTranslation } from '../i18n/i18n'
import { useOfflineQueuePromptStore } from './offline-queue-prompt.store'

export function OfflineQueuePrompt({ playerId }: { playerId: string }): JSX.Element | null {
  const { t } = useTranslation()
  const open = useOfflineQueuePromptStore((state) => state.open)
  const promptPlayerId = useOfflineQueuePromptStore((state) => state.promptPlayerId)
  const serviceUnavailable = useOfflineQueuePromptStore((state) => state.serviceUnavailable)
  const close = useOfflineQueuePromptStore((state) => state.close)
  const continueQueue = useOfflineQueuePromptStore((state) => state.continueQueue)
  const openSettings = useOfflineQueuePromptStore((state) => state.openSettings)

  return (
    <ModalDialog
      open={open && promptPlayerId === playerId}
      onClose={close}
      labelledBy="offline-queue-prompt-title"
      describedBy="offline-queue-prompt-description"
      className="w-[min(40rem,calc(100vw-2rem))] max-w-none border-0 bg-transparent p-0 shadow-none"
    >
      <PromptCard>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-[0.18em] text-sky-300 uppercase">
              {t('queue.discord.eyebrow')}
            </p>
            <h2 id="offline-queue-prompt-title" className="mt-1 text-lg font-semibold text-white">
              {t(serviceUnavailable ? 'settings.discord.unavailable' : 'queue.discord.title')}
            </h2>
            <p
              id="offline-queue-prompt-description"
              className="mt-3 text-sm leading-6 text-neutral-300"
            >
              {t(
                serviceUnavailable
                  ? 'queue.discord.unavailableDescription'
                  : 'queue.discord.description'
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:w-44">
            <Button
              variant="ghost"
              className="w-full border border-white/15"
              onClick={() => continueQueue(playerId)}
            >
              {t('queue.discord.continue')}
            </Button>
            {!serviceUnavailable && (
              <Button className="w-full" onClick={openSettings}>
                {t('queue.discord.setup')}
              </Button>
            )}
          </div>
        </div>
      </PromptCard>
    </ModalDialog>
  )
}
