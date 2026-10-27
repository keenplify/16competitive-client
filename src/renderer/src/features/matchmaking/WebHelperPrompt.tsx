import type { JSX } from 'react'
import { ModalDialog } from '../../components/ui/ModalDialog'
import { useTranslation } from '../i18n/i18n'
import { useWebHelperPromptStore } from './web-helper-prompt.store'
import { WebHelperSetup } from './WebHelperSetup'

export function WebHelperPrompt({ onContinue }: { onContinue: () => void }): JSX.Element {
  const { t } = useTranslation()
  const open = useWebHelperPromptStore((state) => state.open)
  const close = useWebHelperPromptStore((state) => state.close)
  return (
    <ModalDialog
      open={open}
      onClose={close}
      label={t('webHelper.title')}
      describedBy="web-helper-description"
      className="max-w-lg"
      vguiTitlebar={false}
    >
      <div className="p-6 text-white sm:p-8">
        <h2 className="text-xl font-semibold">{t('webHelper.title')}</h2>
        <ul
          id="web-helper-description"
          className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-emerald-300"
        >
          <li>{t('webHelper.perkLaunch')}</li>
          <li>{t('webHelper.perkSettings')}</li>
          <li>{t('webHelper.perkEnhancements')}</li>
          <li>{t('webHelper.perkUpdates')}</li>
        </ul>
        <WebHelperSetup
          className="mt-4"
          onContinue={() => {
            close()
            onContinue()
          }}
        />
      </div>
    </ModalDialog>
  )
}
