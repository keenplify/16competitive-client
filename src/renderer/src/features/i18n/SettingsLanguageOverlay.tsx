import type { JSX } from 'react'
import { useAuthStore } from '../auth/auth.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { LanguageSettings } from './LanguageSettings'

export function SettingsLanguageOverlay(): JSX.Element | null {
  const session = useAuthStore((state) => state.session)
  const page = useNavigationStore((state) => state.page)

  if (!session || page !== 'settings') return null

  return (
    <div className="fixed right-5 bottom-5 z-20 w-[min(24rem,calc(100vw-2.5rem))] sm:right-8 sm:bottom-8">
      <LanguageSettings />
    </div>
  )
}
