import { useEffect, useRef, type JSX } from 'react'
import { useAuthStore } from '../renderer/src/features/auth/auth.store'
import { partnerReturnUrl } from './partner-return'
import { getWebSessionToken } from './browser-session'
import { navigateToPartnerLogin } from './browser-auth'
import { PartnerReturnScreen } from './PartnerReturnScreen'
import App from '../renderer/src/App'
import { hasIncomingPartnerLogin } from './partner-login-capture'
import { usePartnerLoginStore } from './partner-login.store'
import { PartnerLoginController } from './PartnerLoginController'
import { usePartnerReturnStore } from './partner-return.store'

export function WebApp(): JSX.Element {
  const phase = usePartnerLoginStore((state) => state.phase)
  const redirecting = usePartnerReturnStore((state) => state.redirecting)
  const session = useAuthStore((state) => state.session)
  const status = useAuthStore((state) => state.status)
  const returnUrl = partnerReturnUrl()
  const recoveredToken = useRef<string | null>(null)
  const partnerGate = Boolean(returnUrl && !session)
  useEffect(() => {
    if (session) recoveredToken.current = null
    if (!returnUrl || session || redirecting || status !== 'idle') return
    if (!['done', 'failed', 'waiting_login'].includes(phase)) return
    const token = getWebSessionToken()
    if (phase === 'done' && token && recoveredToken.current !== token) {
      recoveredToken.current = token
      void useAuthStore.getState().restore()
      return
    }
    navigateToPartnerLogin(returnUrl)
  }, [session, status, phase, redirecting, returnUrl])
  const signingIn =
    hasIncomingPartnerLogin() && ['idle', 'loading', 'ready', 'submitting'].includes(phase)
  return (
    <>
      <div hidden={signingIn || redirecting}>
        <App preserveMusic={redirecting} partnerSignInOnly={Boolean(returnUrl)} />
      </div>
      {signingIn && !redirecting && <div className="fixed inset-0 bg-neutral-950" aria-busy />}
      {redirecting && <PartnerReturnScreen />}
      {!redirecting && !(partnerGate && phase === 'waiting_login') && <PartnerLoginController />}
    </>
  )
}
