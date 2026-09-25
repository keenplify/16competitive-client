import type { AdminDemosApi } from '../shared/admin-demos'
import type { AuthApi } from '../shared/auth'
import type { AntiCheatApi } from '../shared/anti-cheat'
import type { DailyQuestsApi } from '../shared/daily-quests'
import type { MatchmakingApi } from '../shared/matchmaking'
import type { WindowApi } from '../shared/window'
import type { ModelApi } from '../shared/models'
import type { PartyApi } from '../shared/party'
import type { FriendsApi } from '../shared/friends'
import type { GameSettingsApi } from '../shared/game-settings'
import type { MatchHistoryApi } from '../shared/match-history'
import type { SkinsApi } from '../shared/skins'
import type { UpdaterApi } from '../shared/updater'
import type { LeaderboardApi } from '../shared/leaderboard'
import type { NewsApi } from '../shared/news'
import type { RedeemCodesApi } from '../shared/redeem-codes'
import type { DiagnosticLogsApi } from '../shared/diagnostic-logs'
import type { OperationsApi } from '../shared/operations'
import type { CustomGamesApi } from '../shared/custom-games'

declare global {
  interface Window {
    api: {
      adminDemos?: AdminDemosApi
      auth: AuthApi
      antiCheat: AntiCheatApi
      dailyQuests: DailyQuestsApi
      customGames: CustomGamesApi
      friends: FriendsApi
      gameSettings: GameSettingsApi
      leaderboard: LeaderboardApi
      matchmaking: MatchmakingApi
      matchHistory: MatchHistoryApi
      news: NewsApi
      operations: OperationsApi
      redeemCodes: RedeemCodesApi
      skins: SkinsApi
      models: ModelApi
      party: PartyApi
      updater: UpdaterApi
      window: WindowApi
      diagnosticLogs: DiagnosticLogsApi
    }
  }
}
