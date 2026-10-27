import { useEffect, useRef } from 'react'
import { toast } from 'react-toastify'
import { isWebRuntime } from '../../web-runtime'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'
import { useWebHelperPromptStore } from './web-helper-prompt.store'

export function WebHelperController(): null {
  const { t } = useTranslation()
  const accountId = useAuthStore((state) => state.session?.player.id ?? null)
  const syncAccount = useWebHelperPromptStore((state) => state.syncAccount)
  const successSequence = useWebHelperPromptStore((state) => state.successSequence)
  const announced = useRef(successSequence)
  useEffect(() => {
    if (isWebRuntime()) syncAccount(accountId)
  }, [accountId, syncAccount])
  useEffect(() => {
    if (successSequence === announced.current) return
    announced.current = successSequence
    toast.success(t('webHelper.success'))
  }, [successSequence, t])
  return null
}
