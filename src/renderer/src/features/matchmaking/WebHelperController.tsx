import { useEffect, useRef } from 'react'
import { toast } from 'react-toastify'
import { isWebRuntime } from '../../web-runtime'
import { useAuthStore } from '../auth/auth.store'
import { useTranslation } from '../i18n/i18n'
import { useWebHelperPromptStore } from './web-helper-prompt.store'
import { startWebHelperPresence } from './web-helper-presence'
import { useMatchmakingStore } from './matchmaking.store'

export function WebHelperController(): null {
  useEffect(() => {
    if (isWebRuntime()) return startWebHelperPresence()
    return undefined
  }, [])
  const { t } = useTranslation()
  const accountId = useAuthStore((state) => state.session?.player.id ?? null)
  const syncAccount = useWebHelperPromptStore((state) => state.syncAccount)
  const successSequence = useWebHelperPromptStore((state) => state.successSequence)
  const competitiveReady = useWebHelperPromptStore((state) => state.competitiveReady)
  const announced = useRef(successSequence)
  useEffect(() => {
    if (isWebRuntime()) syncAccount(accountId)
  }, [accountId, syncAccount])
  useEffect(() => {
    if (isWebRuntime() && accountId) void useMatchmakingStore.getState().loadMaps()
  }, [accountId, competitiveReady])
  useEffect(() => {
    if (successSequence === announced.current) return
    announced.current = successSequence
    toast.success(t('webHelper.success'))
  }, [successSequence, t])
  return null
}
