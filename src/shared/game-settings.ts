export const GAME_SETTINGS_CHANNELS = {
  get: 'game-settings:get',
  chooseExecutable: 'game-settings:choose-executable',
  save: 'game-settings:save'
} as const

export interface GameSettings {
  cs16ExecutablePath: string | null
  configFilePath: string
}

export interface GameSettingsApi {
  get(): Promise<GameSettings>
  chooseExecutable(): Promise<string | null>
  save(executablePath: string): Promise<GameSettings>
}
