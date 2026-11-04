import { AlertTriangle } from 'lucide-react'
import type { JSX } from 'react'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'
import { useMatchmakingStore } from './matchmaking.store'

export function ReadyCheckWarningDialog({
  onAcknowledge
}: {
  onAcknowledge: () => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <ModalDialog
      open
      onClose={() => {}}
      vguiTitlebar={false}
      role="alertdialog"
      labelledBy="ready-warning-title"
      describedBy="ready-warning-description"
      className="max-w-md border-amber-400/30 bg-neutral-900 p-6"
    >
      <AlertTriangle className="size-8 text-amber-300" aria-hidden="true" />
      <h2 id="ready-warning-title" className="mt-4 text-2xl font-semibold text-white">
        {t('match.readyWarning.title')}
      </h2>
      <p id="ready-warning-description" className="mt-3 text-sm leading-6 text-neutral-300">
        {t('match.readyWarning.description')}
      </p>
      <Button className="mt-6 w-full" onClick={onAcknowledge}>
        {t('match.readyWarning.acknowledge')}
      </Button>
    </ModalDialog>
  )
}

export function ReadyCheckWarning(): JSX.Element | null {
  const open = useMatchmakingStore((state) => state.readyWarningOpen)
  const acknowledge = useMatchmakingStore((state) => state.acknowledgeReadyWarning)
  return open ? <ReadyCheckWarningDialog onAcknowledge={acknowledge} /> : null
}
