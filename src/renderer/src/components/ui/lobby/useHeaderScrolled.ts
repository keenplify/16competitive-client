import { useCallback, useSyncExternalStore } from 'react'
import type { LobbyPageId } from '../../../features/navigation/navigation.store'

const subscribe = (onChange: () => void): (() => void) => {
  // Capture also sees the Settings page's independent scrolling container.
  document.addEventListener('scroll', onChange, { capture: true, passive: true })
  window.addEventListener('resize', onChange, { passive: true })
  return () => {
    document.removeEventListener('scroll', onChange, true)
    window.removeEventListener('resize', onChange)
  }
}

export function useHeaderScrolled(page: LobbyPageId): boolean {
  const getSnapshot = useCallback((): boolean => {
    const pageScroller = document.querySelector(`[data-page-scroll="${page}"]`)
    return (
      (document.scrollingElement?.scrollTop ?? window.scrollY) > 0 ||
      (pageScroller?.scrollTop ?? 0) > 0
    )
  }, [page])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
