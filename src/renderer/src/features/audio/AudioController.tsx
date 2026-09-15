import { useEffect, useRef, type JSX } from 'react'
import { launcherAudio } from './audio.manager'
import { useAudioSettingsStore } from './audio.store'
import { useAuthStore } from '../auth/auth.store'
import { useMatchmakingStore } from '../matchmaking/matchmaking.store'

export function AudioController(): JSX.Element | null {
  const bgmVolume = useAudioSettingsStore((state) => state.bgmVolume)
  const sfxVolume = useAudioSettingsStore((state) => state.sfxVolume)
  const selectedBgmId = useAudioSettingsStore((state) => state.selectedBgmId)
  const playerId = useAuthStore((state) => state.session?.player.id ?? null)
  const match = useMatchmakingStore((state) => state.match)
  const readyResponse = useMatchmakingStore((state) => state.readyResponse)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const gameExited = useMatchmakingStore((state) => state.gameExited)
  const completedMatch = useMatchmakingStore((state) => state.completedMatch)
  const matchmakingError = useMatchmakingStore((state) => state.error)
  const gameStarting = queueStatus === 'server_ready' && !gameExited && !matchmakingError
  const shouldUseLobbyLowPass =
    playerId !== null &&
    (match === null || gameExited || (queueStatus === 'server_ready' && matchmakingError !== null))

  const previousMatchId = useRef<string | null>(null)
  const previousReadyResponse = useRef(readyResponse)
  const previousGameStarting = useRef(gameStarting)
  const previousCompletedMatchId = useRef<string | null>(null)

  useEffect(() => {
    launcherAudio.setBgmTrack(selectedBgmId)
  }, [selectedBgmId])

  useEffect(() => {
    launcherAudio.setBgmLowPass(shouldUseLobbyLowPass)
  }, [shouldUseLobbyLowPass])

  useEffect(() => {
    launcherAudio.setBgmVolume(bgmVolume)
  }, [bgmVolume])

  useEffect(() => {
    launcherAudio.setSfxVolume(sfxVolume)
  }, [sfxVolume])

  useEffect(() => {
    launcherAudio.startBgm()

    const syncFocus = (): void => launcherAudio.setBgmFocused(document.hasFocus())
    const handleVisibilityChange = (): void => {
      launcherAudio.setBgmFocused(!document.hidden && document.hasFocus())
    }
    const retry = (): void => launcherAudio.startBgm()
    window.addEventListener('pointerdown', retry, { once: true })
    window.addEventListener('keydown', retry, { once: true })
    window.addEventListener('focus', syncFocus)
    window.addEventListener('blur', syncFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const handleClick = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      const navigation = target.closest('[data-audio-sfx="forward"], [data-audio-sfx="backward"]')
      if (navigation instanceof HTMLButtonElement && !navigation.disabled) {
        launcherAudio.playSfx(navigation.dataset.audioSfx === 'backward' ? 'backward' : 'forward')
        return
      }

      const findMatch = target.closest('[data-audio-sfx="findMatch"]')
      if (findMatch instanceof HTMLButtonElement && !findMatch.disabled) {
        launcherAudio.playSfx('findMatch')
      }
    }

    const removeMatchmakingListener = window.api.matchmaking.onEvent((event) => {
      if (event.type === 'party_invitation_received') launcherAudio.playSfx('partyInvitation')
    })

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && document.querySelector('[role="dialog"]')) {
        launcherAudio.playSfx('backward')
      }
    }

    document.addEventListener('click', handleClick)
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('click', handleClick)
      window.removeEventListener('keydown', handleEscape)
      removeMatchmakingListener()
      window.removeEventListener('pointerdown', retry)
      window.removeEventListener('keydown', retry)
      window.removeEventListener('focus', syncFocus)
      window.removeEventListener('blur', syncFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    const matchId = match?.matchId ?? null
    if (matchId && matchId !== previousMatchId.current) launcherAudio.playSfx('matchFound')
    previousMatchId.current = matchId
  }, [match?.matchId])

  useEffect(() => {
    if (readyResponse === 'accepted' && previousReadyResponse.current !== 'accepted') {
      launcherAudio.playSfx('matchAccepted')
    }
    previousReadyResponse.current = readyResponse
  }, [readyResponse])

  useEffect(() => {
    if (gameStarting && !previousGameStarting.current) {
      launcherAudio.playSfx('gameStarting')
      launcherAudio.fadeBgmForGame()
    } else if (!gameStarting && previousGameStarting.current && !completedMatch) {
      launcherAudio.restoreBgm()
    }
    previousGameStarting.current = gameStarting
  }, [gameStarting, completedMatch])

  useEffect(() => {
    if (!completedMatch || completedMatch.matchId === previousCompletedMatchId.current) return
    previousCompletedMatchId.current = completedMatch.matchId

    const playerTeam = completedMatch.teams.teamA.some((player) => player.id === playerId)
      ? 1
      : completedMatch.teams.teamB.some((player) => player.id === playerId)
        ? 2
        : null

    if (playerTeam)
      launcherAudio.playSfx(completedMatch.winner === playerTeam ? 'victory' : 'defeat')
    launcherAudio.restoreBgm()
  }, [completedMatch, playerId])

  return null
}
