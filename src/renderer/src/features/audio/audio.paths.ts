export const MUSIC_SETS = [
  {
    id: 'rock',
    label: 'Counter-Strike · Huguito',
    backgroundMusic: {
      title: 'Improved Counter Strike Menu Music 2026 — Huguito [v1.1]',
      path: 'audio/bgm/huguito-menu-2026-v1-1.mp3'
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

const resolveAudioPath = (path: string): string =>
  window.__SIXTEEN_COMPETITIVE_WEB__ === true
    ? `${document.querySelector<HTMLMetaElement>('meta[name="16c-base-path"]')?.content ?? '/pwa/'}${path}`
    : path

export const getLauncherBgmTrack = (id: LauncherBgmId) => {
  const track = getLauncherMusicSet(id).backgroundMusic
  return { ...track, path: resolveAudioPath(track.path) }
}

export const AUDIO_PATHS = {
  sfx: {
    rewardFIELD: 'audio/sfx/reward-field.wav',
    rewardFORGE: 'audio/sfx/reward-forge.wav',
    rewardSTRIKE: 'audio/sfx/reward-strike.wav',
    rewardVANGUARD: 'audio/sfx/reward-vanguard.wav',
    rewardNEON: 'audio/sfx/reward-neon.wav',
    rewardCRIMSON: 'audio/sfx/reward-crimson.wav',
    rewardRELIC: 'audio/sfx/reward-relic.wav',
    rewardVAULT: 'audio/sfx/reward-vault.wav',
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
  resolveAudioPath(
    sound === 'matchFound' ? getLauncherMusicSet(setId).cues.matchFound : AUDIO_PATHS.sfx[sound]
  )
