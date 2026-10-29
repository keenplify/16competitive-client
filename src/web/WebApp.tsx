import type { JSX } from 'react'
import App from '../renderer/src/App'
import { hasIncomingPartnerLogin } from './partner-login-capture'
import { usePartnerLoginStore } from './partner-login.store'
import { PartnerLoginController } from './PartnerLoginController'
import { usePartnerReturnStore } from './partner-return.store'

export function WebApp(): JSX.Element {
  const phase = usePartnerLoginStore((state) => state.phase)
  const redirecting = usePartnerReturnStore((state) => state.redirecting)
  const signingIn =
    hasIncomingPartnerLogin() && ['idle', 'loading', 'ready', 'submitting'].includes(phase)
  return (
    <>
      <div hidden={signingIn || redirecting}>
        <App />
      </div>
      {(signingIn || redirecting) && <div className="fixed inset-0 bg-neutral-950" aria-busy />}
      {!redirecting && <PartnerLoginController />}
    </>
  )
}
