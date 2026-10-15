import type { GameId } from '../../../shared/legacy-game'

export interface GameInstallation {
  game: GameId
  folderPath: string
  executablePath: string
  gameDirectory: string
}

export interface GameLaunchPlan {
  executable: string
  args: string[]
  cwd: string
}

export interface GameMenuLaunchOptions {
  wineDisplay?: {
    gamescopeExecutable: string
    width: number
    height: number
  }
}

/** Version-specific filesystem checks and argument construction stay outside IPC/UI. */
export interface GameAdapter<T extends GameInstallation> {
  readonly id: T['game']
  validateInstallation(folder: unknown, platform: NodeJS.Platform): Promise<T>
  buildMenuLaunchPlan(installation: T, options?: GameMenuLaunchOptions): GameLaunchPlan
}
