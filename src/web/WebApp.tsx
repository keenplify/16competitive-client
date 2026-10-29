import type { JSX } from 'react'
import App from '../renderer/src/App'
import { hasIncomingPartnerLogin } from './partner-login-capture'
import { usePartnerLoginStore } from './partner-login.store'
import { PartnerLoginController } from './PartnerLoginController'

export function WebApp(): JSX.Element {
  const phase = usePartnerLoginStore((state) => state.phase)
  const signingIn =
    hasIncomingPartnerLogin() && ['idle', 'loading', 'ready', 'submitting'].includes(phase)
  return (
    <>
      <div hidden={signingIn}>
        <App />
      </div>
      {signingIn && <div className="fixed inset-0 bg-neutral-950" />}
      <PartnerLoginController />
    </>
  )
}
