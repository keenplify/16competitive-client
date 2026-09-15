import { useEffect, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../auth/auth.store'
import { useNavigationStore } from '../navigation/navigation.store'
import { LanguageSettings } from './LanguageSettings'

const findGeneralSection = (): HTMLElement | null => {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('main section'))
  return (
    sections.find((section) => {
      const heading = section.firstElementChild?.textContent ?? ''
      return heading.includes('General') && heading.includes('Game client')
    }) ?? sections[0] ?? null
  )
}

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

    const ensureMounted = (): void => {
      const generalSection = findGeneralSection()
      if (!generalSection) return

      if (mountedHost?.isConnected && mountedHost.parentElement === generalSection) {
        if (host !== mountedHost) setHost(mountedHost)
        return
      }

      const existing = generalSection.querySelector<HTMLDivElement>('[data-language-settings-host]')
      if (existing) {
        mountedHost = existing
        setHost(existing)
        return
      }

      const nextHost = document.createElement('div')
      nextHost.dataset.languageSettingsHost = 'true'
      nextHost.className = 'mb-5'

      const sectionHeader = generalSection.firstElementChild
      if (sectionHeader) sectionHeader.insertAdjacentElement('afterend', nextHost)
      else generalSection.prepend(nextHost)

      mountedHost = nextHost
      setHost(nextHost)
    }

    ensureMounted()

    // SettingsPage owns this DOM subtree and may reconcile away nodes inserted by a portal.
    // Keep the host attached directly below the General heading if that happens.
    const observer = new MutationObserver(ensureMounted)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      mountedHost?.remove()
      setHost(null)
    }
  }, [page, session])

  if (page !== 'settings' || !session || !host?.isConnected) return null
  return createPortal(<LanguageSettings />, host)
}
