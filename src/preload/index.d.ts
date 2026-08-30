import type { AuthApi } from '../shared/auth'
import type { MatchmakingApi } from '../shared/matchmaking'
import type { WindowApi } from '../shared/window'
import type { ModelApi } from '../shared/models'
import type { PartyApi } from '../shared/party'
import type { GameSettingsApi } from '../shared/game-settings'
import type { MatchHistoryApi } from '../shared/match-history'

declare global {
  interface Window {
    api: {
      auth: AuthApi
      gameSettings: GameSettingsApi
      matchmaking: MatchmakingApi
      matchHistory: MatchHistoryApi
      models: ModelApi
      party: PartyApi
      window: WindowApi
    }
  }
}
