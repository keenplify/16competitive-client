export const MUSIC_SETS = [
  {
    id: 'hip-hop',
    label: 'Hip-Hop',
    backgroundMusic: {
      title: 'Enth E Nd',
      path: 'audio/bgm/enth-e-nd.mp3'
    },
    cues: {
      matchFound: 'audio/sfx/match-found.mp3'
    }
  }
] as const

export type LauncherMusicSetId = (typeof MUSIC_SETS)[number]['id']
export type LauncherBgmId = LauncherMusicSetId
export const DEFAULT_BGM_ID: LauncherBgmId = MUSIC_SETS[0].id

export const isLauncherBgmId = (value: unknown): value is LauncherBgmId =>
  typeof value === 'string' && MUSIC_SETS.some((set) => set.id === value)

export const getLauncherMusicSet = (id: LauncherMusicSetId) =>
  MUSIC_SETS.find((set) => set.id === id) ?? MUSIC_SETS[0]

export const getLauncherBgmTrack = (id: LauncherBgmId) => getLauncherMusicSet(id).backgroundMusic

export const AUDIO_PATHS = {
  sfx: {
    tab: 'audio/sfx/tab.mp3',
    findMatch: 'audio/sfx/find-match.mp3',
    forward: 'audio/sfx/forward.mp3',
    backward: 'audio/sfx/backward.mp3',
    partyInvitation: 'audio/sfx/party-invitation.mp3',
    matchFound: 'audio/sfx/match-found.mp3',
    matchAccepted: 'audio/sfx/match-accepted.mp3',
    gameStarting: 'audio/sfx/game-starting.mp3',
    victory: 'audio/sfx/victory.mp3',
    defeat: 'audio/sfx/defeat.mp3'
  }
} as const

export type LauncherSfx = keyof typeof AUDIO_PATHS.sfx

export const getLauncherSfxPath = (setId: LauncherMusicSetId, sound: LauncherSfx): string =>
  sound === 'matchFound' ? getLauncherMusicSet(setId).cues.matchFound : AUDIO_PATHS.sfx[sound]
