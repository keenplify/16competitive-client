import { useEffect, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../auth/auth.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { LanguageSettings } from './LanguageSettings'

export function SettingsLanguageOverlay(): JSX.Element | null {
  const page = useNavigationStore((state) => state.page)
  const session = useAuthStore((state) => state.session)
  const [host, setHost] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (page !== 'settings' || !session) {
      setHost(null)
      return
    }

    let mountedHost: HTMLDivElement | null = null

    const mountIntoGeneral = (): boolean => {
      const generalSection = document.querySelector<HTMLElement>('main section')
      if (!generalSection) return false

      const existing = generalSection.querySelector<HTMLDivElement>('[data-language-settings-host]')
      if (existing) {
        mountedHost = existing
        setHost(existing)
        return true
      }

      const nextHost = document.createElement('div')
      nextHost.dataset.languageSettingsHost = 'true'
      nextHost.className = 'mb-5'
      generalSection.insertBefore(nextHost, generalSection.children[1] ?? null)
      mountedHost = nextHost
      setHost(nextHost)
      return true
    }

    if (mountIntoGeneral()) {
      return () => {
        mountedHost?.remove()
        setHost(null)
      }
    }

    const observer = new MutationObserver(() => {
      if (mountIntoGeneral()) observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      mountedHost?.remove()
      setHost(null)
    }
  }, [page, session])

  if (page !== 'settings' || !session || !host) return null
  return createPortal(<LanguageSettings />, host)
}
