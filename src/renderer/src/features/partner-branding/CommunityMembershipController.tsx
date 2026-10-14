import { useEffect } from 'react'
import { useAuthStore } from '../auth/auth.store'
import { useCommunityMembershipStore } from './community-membership.store'
export function CommunityMembershipController(): null {
  const accountId = useAuthStore((state) =>
    state.status === 'authenticated' ? (state.session?.player.id ?? null) : null
  )
  const load = useCommunityMembershipStore((state) => state.load),
    clear = useCommunityMembershipStore((state) => state.clear)
  useEffect(() => {
    if (!accountId) {
      clear()
      return
    }
    void load(accountId)
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(accountId)
    }, 30_000)
    return () => {
      window.clearInterval(timer)
      clear()
    }
  }, [accountId, clear, load])
  return null
}
