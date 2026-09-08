export const AUDIO_PATHS = {
  bgm: {
    launcher: 'audio/bgm/launcher-bgm.mp3'
  },
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
