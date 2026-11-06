import { toast } from 'react-toastify'
import { translate, useLanguageStore, type TranslationKey } from '../i18n/i18n'
import { useWebHelperPromptStore } from './web-helper-prompt.store'

/** Hiding installer guidance never substitutes for a real helper check. */
export async function verifyInstalledNativeHelper(): Promise<boolean> {
  const t = (key: TranslationKey): string => translate(useLanguageStore.getState().language, key)
  const feedback = toast.loading(t('webHelper.checking'))
  let status: Awaited<ReturnType<ReturnType<typeof useWebHelperPromptStore.getState>['checkNative']>>
  try {
    status = await useWebHelperPromptStore.getState().checkNative()
  } catch {
    toast.update(feedback, { render: t('webHelper.unavailable'), type: 'error', isLoading: false, autoClose: 5000 })
    return false
  }
  const ready = status === 'rust'
  toast.update(feedback, {
    render: t(ready ? 'webHelper.rustReady' : status === 'outdated-rust' ? 'webHelper.rustOutdated' : 'webHelper.unavailable'),
    type: ready ? 'success' : 'error', isLoading: false, autoClose: 5000
  })
  return ready
}
