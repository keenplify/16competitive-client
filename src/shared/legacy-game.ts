export const LEGACY_GAME_CHANNELS = {
  get: 'legacy-game:get',
  choose: 'legacy-game:choose',
  launch: 'legacy-game:launch',
  openDownload: 'legacy-game:open-download'
} as const

export const CS13_DOWNLOAD_URL =
  'https://www.moddb.com/mods/counter-strike/downloads/counter-strike-13'

export type GameId = 'cs16' | 'cs13'

export interface LegacyInstallation {
  game: 'cs13'
  folderPath: string
  executablePath: string
  gameDirectory: string
  modDirectory: 'cstrike' | 'cstrk13'
  /** Metadata evidence, not proof of binary authenticity or protocol compatibility. */
  versionEvidence: 'liblist.gam'
  runtime: 'native' | 'wine'
}

export type LegacyGameError =
  | 'unsupportedPlatform'
  | 'invalidInstallation'
  | 'installationRequired'
  | 'busy'
  | 'launchFailed'
  | 'settingsFailed'
  | 'downloadFailed'

export type LegacyGameResult<T> = { ok: true; value: T } | { ok: false; error: LegacyGameError }

export interface LegacyGameProfile {
  folderPath: string | null
  installation: LegacyInstallation | null
}

export interface LegacyGameApi {
  get(): Promise<LegacyGameResult<LegacyGameProfile>>
  /** Select, validate and persist a folder. Cancel returns null. */
  choose(): Promise<LegacyGameResult<LegacyGameProfile | null>>
  /** Opens the ordinary game menu; never connects to a matchmaking server. */
  launch(): Promise<LegacyGameResult<null>>
  openDownload(): Promise<LegacyGameResult<null>>
}
