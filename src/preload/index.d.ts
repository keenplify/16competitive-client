import type { AuthApi } from '../shared/auth'
import type { MatchmakingApi } from '../shared/matchmaking'
import type { WindowApi } from '../shared/window'

declare global {
  interface Window {
    api: {
      auth: AuthApi
      matchmaking: MatchmakingApi
      window: WindowApi
    }
  }
}
