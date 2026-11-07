import { app } from 'electron'
import { join } from 'node:path'
import { MatchmakingDiagnostics } from '../shared/matchmaking-diagnostics'
import { getSessionPlayerId } from './auth'
import { LaunchHistory } from './launch-history'

class MainMatchmakingDiagnostics extends MatchmakingDiagnostics {
  private readonly history = new LaunchHistory(
    () => join(app.getPath('userData'), 'launch-history'),
    () => app.getVersion()
  )
  override setOwner(owner: string | null): void {
    const playerId = owner ? getSessionPlayerId() : null
    super.setOwner(playerId)
    this.history.setOwner(playerId)
  }
  override record(stage: string, event: unknown): void {
    super.record(stage, event)
    this.history.record(stage, event)
  }
  historyReport(): Promise<string> {
    return this.history.report()
  }
  flush(): Promise<void> {
    return this.history.flush()
  }
}
export const matchmakingDiagnostics = new MainMatchmakingDiagnostics()
