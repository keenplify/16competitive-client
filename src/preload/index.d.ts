import type { AuthApi } from '../shared/auth'
import type { MatchmakingApi } from '../shared/matchmaking'
import type { WindowApi } from '../shared/window'
import type { ModelApi } from '../shared/models'
import type { PartyApi } from '../shared/party'
import type { GameSettingsApi } from '../shared/game-settings'
import type { MatchHistoryApi } from '../shared/match-history'
import type { SkinsApi } from '../shared/skins'
import type { UpdaterApi } from '../shared/updater'
import type { LeaderboardApi } from '../shared/leaderboard'
import type { NewsApi } from '../shared/news'

declare global {
  interface Window {
    api: {
      auth: AuthApi
      gameSettings: GameSettingsApi
      leaderboard: LeaderboardApi
      matchmaking: MatchmakingApi
      matchHistory: MatchHistoryApi
      news: NewsApi
      skins: SkinsApi
      models: ModelApi
      party: PartyApi
      updater: UpdaterApi
      window: WindowApi
    }
  }
}
