import type { JSX } from 'react'
import { Button } from '../../components/ui/Button'
import { SetupCard } from '../../components/ui/SetupCard'
import { useTranslation } from '../i18n/i18n'
import { NativeHelperSettingsPanel } from '../settings/NativeHelperSettingsPanel'
import { useNativeHelperSettingsStore } from '../settings/native-helper-settings.store'
import { useWebHelperPromptStore } from './web-helper-prompt.store'
import { WebHelperSetup } from './WebHelperSetup'

export function WebHelperOnboardingPage(): JSX.Element {
  const { t } = useTranslation()
  const nativeReady = useWebHelperPromptStore((state) => state.nativeReady)
  const close = useWebHelperPromptStore((state) => state.close)
  const folderStatus = useNativeHelperSettingsStore((state) => state.status)
  const step = nativeReady ? 2 : 1
  const title = t(nativeReady ? 'webHelper.folder16' : 'webHelper.title')

  return (
    <SetupCard
      eyebrow={`${t('webHelper.title')} · ${step} / 2`}
      title={title}
      description={t(nativeReady ? 'webHelper.localSettings' : 'webHelper.description')}
      className="max-w-xl"
      contentKey={String(step)}
    >
      <div className="mb-7 flex gap-2" aria-label={`${title}: ${step} / 2`}>
        {[1, 2].map((item) => (
          <span
            key={item}
            className={`setup-progress h-1 flex-1 ${item <= step ? 'setup-progress-active bg-sky-400' : 'bg-white/10'}`}
          />
        ))}
      </div>
      {nativeReady ? (
        <>
          <NativeHelperSettingsPanel
            foldersOnly
            className="mt-0 border-0 bg-transparent p-0 sm:p-0"
          />
          <Button
            className="mt-5 w-full bg-sky-400 hover:bg-sky-300"
            disabled={!['idle', 'error'].includes(folderStatus)}
            onClick={close}
          >
            {t('legacy.continue')}
          </Button>
        </>
      ) : (
        <WebHelperSetup inlineSetup onContinue={close} />
      )}
    </SetupCard>
  )
}
