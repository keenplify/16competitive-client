import {
  DEFAULT_BGM_ID,
  getLauncherBgmTrack,
  getLauncherSfxPath,
  type LauncherBgmId,
  type LauncherSfx
} from './audio.paths'

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value))
const volumeToUnit = (value: number): number => clampUnit(value / 100)
const NORMAL_FILTER_FREQUENCY = 20_000
const LOBBY_LOWPASS_FREQUENCY = 900
const LOBBY_BGM_VOLUME_FACTOR = 0.5
const MATCH_FOUND_BGM_DUCK_FACTOR = 0.1
const SFX_VOLUME_FACTOR = 0.5

class LauncherAudioManager {
  private bgm: HTMLAudioElement | null = null
  private bgmTrackId: LauncherBgmId = DEFAULT_BGM_ID
  private audioContext: AudioContext | null = null
  private bgmSource: MediaElementAudioSourceNode | null = null
  private bgmFilter: BiquadFilterNode | null = null
  private bgmLowPass = false
  private bgmVolume = 50
  private bgmPlaybackVolume = volumeToUnit(this.bgmVolume)
  private bgmDuckCount = 0
  private sfxVolume = 50
  private bgmSuppressed = false
  private bgmFocused = document.hasFocus()
  private fadeFrame: number | null = null
  private playbackUnlocked = window.__SIXTEEN_COMPETITIVE_WEB__ !== true

  private createBgm(trackId: LauncherBgmId): HTMLAudioElement {
    const bgm = new Audio(getLauncherBgmTrack(trackId).path)
    bgm.loop = true
    bgm.preload = 'none'
    bgm.volume = this.getEffectiveBgmVolume()
    return bgm
  }

  private getBgm(): HTMLAudioElement {
    if (!this.bgm) {
      this.bgm = this.createBgm(this.bgmTrackId)
      this.connectBgmFilter(this.bgm)
    }
    return this.bgm
  }

  private connectBgmFilter(bgm: HTMLAudioElement): void {
    if (!this.playbackUnlocked || this.bgmSource || !window.AudioContext) return

    const context = new AudioContext()
    const source = context.createMediaElementSource(bgm)
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.7
    filter.frequency.value = this.bgmLowPass ? LOBBY_LOWPASS_FREQUENCY : NORMAL_FILTER_FREQUENCY
    source.connect(filter)
    filter.connect(context.destination)

    this.audioContext = context
    this.bgmSource = source
    this.bgmFilter = filter
  }

  private resumeAudioContext(): void {
    if (this.audioContext?.state === 'suspended')
      void this.audioContext.resume().catch(() => undefined)
  }

  private getEffectiveBgmVolume(): number {
    const lobbyFactor = this.bgmLowPass ? LOBBY_BGM_VOLUME_FACTOR : 1
    const duckFactor = this.bgmDuckCount > 0 ? MATCH_FOUND_BGM_DUCK_FACTOR : 1
    return this.bgmPlaybackVolume * lobbyFactor * duckFactor
  }

  private applyBgmVolume(): void {
    if (this.bgm) this.bgm.volume = this.bgmFocused ? this.getEffectiveBgmVolume() : 0
  }

  setBgmTrack(trackId: LauncherBgmId): void {
    if (trackId === this.bgmTrackId) return

    if (this.fadeFrame !== null) {
      cancelAnimationFrame(this.fadeFrame)
      this.fadeFrame = null
    }

    this.bgm?.pause()
    this.bgm = null
    this.bgmSource = null
    this.bgmFilter = null
    this.bgmTrackId = trackId

    if (this.canPlayBgm()) {
      const bgm = this.getBgm()
      void bgm.play().catch(() => undefined)
    }
  }

  unlockPlayback(): void {
    if (this.playbackUnlocked) {
      this.startBgm()
      return
    }
    this.playbackUnlocked = true
    if (this.bgm) this.connectBgmFilter(this.bgm)
    this.startBgm()
  }

  startBgm(): void {
    if (!this.canPlayBgm()) return
    const bgm = this.getBgm()
    this.resumeAudioContext()
    this.applyBgmVolume()
    void bgm.play().catch(() => undefined)
  }

  setBgmVolume(value: number): void {
    this.bgmVolume = Math.max(0, Math.min(100, value))
    this.bgmPlaybackVolume = volumeToUnit(this.bgmVolume)
    if (!this.canPlayBgm()) return
    const bgm = this.getBgm()
    this.resumeAudioContext()
    this.applyBgmVolume()
    if (this.bgmVolume > 0) void bgm.play().catch(() => undefined)
  }

  setSfxVolume(value: number): void {
    this.sfxVolume = Math.max(0, Math.min(100, value))
  }

  setBgmLowPass(enabled: boolean, durationMs = 1_000): void {
    if (enabled === this.bgmLowPass) return
    this.bgmLowPass = enabled
    this.applyBgmVolume()
    if (!this.bgmFilter || !this.audioContext) return

    const targetFrequency = enabled ? LOBBY_LOWPASS_FREQUENCY : NORMAL_FILTER_FREQUENCY
    const now = this.audioContext.currentTime
    this.bgmFilter.frequency.cancelScheduledValues(now)
    this.bgmFilter.frequency.setValueAtTime(this.bgmFilter.frequency.value, now)
    this.bgmFilter.frequency.linearRampToValueAtTime(targetFrequency, now + durationMs / 1_000)
  }

  setBgmFocused(focused: boolean): void {
    this.bgmFocused = focused
    if (!focused) {
      if (this.fadeFrame !== null) {
        cancelAnimationFrame(this.fadeFrame)
        this.fadeFrame = null
      }
      if (this.bgm) this.bgm.volume = 0
      return
    }

    this.startBgm()
  }

  playSfx(sound: LauncherSfx): void {
    if (!this.playbackUnlocked || this.sfxVolume === 0) return
    const audio = new Audio(getLauncherSfxPath(this.bgmTrackId, sound))
    audio.preload = 'none'
    audio.volume = volumeToUnit(this.sfxVolume) * SFX_VOLUME_FACTOR
    const releaseBgmDuck = sound === 'matchFound' ? this.duckBgmForMatchFound(audio) : null
    void audio.play().catch(() => releaseBgmDuck?.())
  }

  private duckBgmForMatchFound(audio: HTMLAudioElement): () => void {
    this.bgmDuckCount += 1
    this.applyBgmVolume()

    let released = false
    const release = (): void => {
      if (released) return
      released = true
      this.bgmDuckCount = Math.max(0, this.bgmDuckCount - 1)
      this.applyBgmVolume()
    }

    audio.addEventListener('ended', release, { once: true })
    audio.addEventListener('error', release, { once: true })
    return release
  }

  fadeBgmForGame(durationMs = 2_500): void {
    this.bgmSuppressed = true
    this.fadeBgmTo(0, durationMs, true)
  }

  restoreBgm(durationMs = 1_500): void {
    this.bgmSuppressed = false
    if (!this.playbackUnlocked) return
    const bgm = this.getBgm()
    if (this.canPlayBgm()) void bgm.play().catch(() => undefined)
    this.fadeBgmTo(volumeToUnit(this.bgmVolume), durationMs)
  }

  private canPlayBgm(): boolean {
    return this.playbackUnlocked && !this.bgmSuppressed && this.bgmFocused && this.bgmVolume > 0
  }

  private fadeBgmTo(targetVolume: number, durationMs: number, pauseAtZero = false): void {
    if (!this.playbackUnlocked) return
    const bgm = this.getBgm()
    if (this.fadeFrame !== null) cancelAnimationFrame(this.fadeFrame)

    const startVolume = this.bgmPlaybackVolume
    const target = this.bgmFocused ? clampUnit(targetVolume) : 0
    if (durationMs <= 0 || startVolume === target) {
      this.bgmPlaybackVolume = target
      this.applyBgmVolume()
      if (pauseAtZero && target === 0) bgm.pause()
      return
    }

    const startedAt = performance.now()
    const step = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      this.bgmPlaybackVolume = clampUnit(startVolume + (target - startVolume) * progress)
      this.applyBgmVolume()
      if (progress < 1) {
        this.fadeFrame = requestAnimationFrame(step)
        return
      }
      this.fadeFrame = null
      if (pauseAtZero && target === 0) bgm.pause()
    }

    this.fadeFrame = requestAnimationFrame(step)
  }
}

export const launcherAudio = new LauncherAudioManager()
