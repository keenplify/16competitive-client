import type { JSX } from 'react'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { Button } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'
import { useWebHelperPromptStore } from './web-helper-prompt.store'
import { WebHelperSetup } from './WebHelperSetup'

export function WebHelperPrompt({ onContinue }: { onContinue: () => void }): JSX.Element {
  const { t } = useTranslation()
  const open = useWebHelperPromptStore((state) => state.open)
  const close = useWebHelperPromptStore((state) => state.close)
  const dismissForever = useWebHelperPromptStore((state) => state.dismissForever)
  const continuePlay = (): void => {
    close()
    onContinue()
  }
  const neverShow = (): void => {
    dismissForever()
    onContinue()
  }
  return (
    <ModalDialog open={open} onClose={close} label={t('webHelper.title')}>
      <div className="w-full max-w-lg border border-neutral-700 bg-neutral-950 p-6 text-white">
        <h2 className="text-xl font-semibold">{t('webHelper.title')}</h2>
        <p className="mt-3 text-sm text-neutral-300">{t('webHelper.description')}</p>
        <WebHelperSetup className="mt-4" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="primary" onClick={continuePlay}>
            {t('webHelper.continue')}
          </Button>
          <Button type="button" variant="secondary" onClick={neverShow}>
            {t('webHelper.never')}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            {t('webHelper.close')}
          </Button>
        </div>
      </div>
    </ModalDialog>
  )
}
