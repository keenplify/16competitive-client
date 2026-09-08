export const BGM_TRACKS = [
  { id: 'launcher-1', label: 'Launcher Theme 1', path: 'audio/bgm/launcher-1.mp3' },
  { id: 'launcher-2', label: 'Launcher Theme 2', path: 'audio/bgm/launcher-2.mp3' },
  { id: 'launcher-3', label: 'Launcher Theme 3', path: 'audio/bgm/launcher-3.mp3' }
] as const

export type LauncherBgmId = (typeof BGM_TRACKS)[number]['id']
export const DEFAULT_BGM_ID: LauncherBgmId = BGM_TRACKS[0].id

export const isLauncherBgmId = (value: unknown): value is LauncherBgmId =>
  typeof value === 'string' && BGM_TRACKS.some((track) => track.id === value)

export const getLauncherBgmTrack = (id: LauncherBgmId) =>
  BGM_TRACKS.find((track) => track.id === id) ?? BGM_TRACKS[0]

export const AUDIO_PATHS = {
  sfx: {
    tab: 'audio/sfx/tab.mp3',
    partyInvitation: 'audio/sfx/party-invitation.mp3',
    matchFound: 'audio/sfx/match-found.mp3',
    matchAccepted: 'audio/sfx/match-accepted.mp3',
    gameStarting: 'audio/sfx/game-starting.mp3',
    victory: 'audio/sfx/victory.mp3',
    defeat: 'audio/sfx/defeat.mp3'
  }
} as const

export type LauncherSfx = keyof typeof AUDIO_PATHS.sfx
