import { useAuthStore } from '../auth/auth.store'
import { usePartyStore } from '../party/party.store'
import { useMatchmakingStore } from './matchmaking.store'
import { useWebHelperPromptStore } from './web-helper-prompt.store'
import type { NativeHelperPresence } from '../../../../shared/native-helper-presence'

export function startWebHelperPresence(): () => void {
  let stopped = false
  let busy = false
  let dirty = false
  let sent = false
  let lastKey = ''
  let lastSentAt = 0
  const sync = async (keepalive = false): Promise<void> => {
    if (stopped) return
    if (busy) {
      dirty = true
      return
    }
    const api = window.api.matchmaking.nativeHelperPresence
    if (!api) return
    const accountId = useAuthStore.getState().session?.player.id
    const ready = useWebHelperPromptStore.getState().nativeReady
    if ((!ready || !accountId) && !sent) return
    const state = useMatchmakingStore.getState()
    const party = usePartyStore.getState().party
    const activity: NativeHelperPresence | null =
      accountId && ready
        ? {
            phase: state.match
              ? 'match'
              : ['joining', 'queued'].includes(state.queueStatus)
                ? 'queue'
                : 'lobby',
            mode: state.match?.mode ?? state.selectedMode,
            map:
              state.match?.mapId ??
              (state.selectedMapIds.length === 1 ? state.selectedMapIds[0] : null),
            partyId: party?.id ?? null,
            partySize: party?.members.length ?? 0,
            joinSecret:
              state.match || state.queueStatus !== 'idle' ? null : (party?.joinSecret ?? null),
            startedAt: null
          }
        : null
    const key = JSON.stringify([accountId, activity])
    if (key === lastKey && !keepalive) return
    busy = true
    try {
      await api(activity)
      sent = activity !== null
      lastKey = key
      lastSentAt = Date.now()
    } catch {
      // Helper/Discord is optional; never interrupt matchmaking for Rich Presence.
    } finally {
      busy = false
      if (dirty) {
        dirty = false
        void sync()
      }
    }
  }
  const changed = (): void => {
    void sync()
  }
  const remove = [
    useAuthStore.subscribe(changed),
    usePartyStore.subscribe(changed),
    useMatchmakingStore.subscribe(changed),
    useWebHelperPromptStore.subscribe(changed)
  ]
  // Only party lobbies poll join callbacks frequently; unchanged activity is
  // otherwise renewed every 30s, without reopening Discord or the helper.
  const timer = window.setInterval(() => {
    const party = usePartyStore.getState().party
    if (Date.now() - lastSentAt >= (party ? 2000 : 30000)) void sync(true)
  }, 2000)
  void sync()
  return () => {
    stopped = true
    remove.forEach((fn) => fn())
    window.clearInterval(timer)
    if (sent) void window.api.matchmaking.nativeHelperPresence?.(null).catch(() => undefined)
  }
}
