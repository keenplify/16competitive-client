import {
  DEFAULT_BGM_ID,
  getLauncherBgmTrack,
  AUDIO_PATHS,
  type LauncherBgmId,
  type LauncherSfx
} from './audio.paths'

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value))
const volumeToUnit = (value: number): number => clampUnit(value / 100)

class LauncherAudioManager {
  private bgm: HTMLAudioElement | null = null
  private bgmTrackId: LauncherBgmId = DEFAULT_BGM_ID
  private bgmVolume = 50
  private sfxVolume = 50
  private bgmSuppressed = false
  private fadeFrame: number | null = null

  private createBgm(trackId: LauncherBgmId): HTMLAudioElement {
    const bgm = new Audio(getLauncherBgmTrack(trackId).path)
    bgm.loop = true
    bgm.preload = 'none'
    bgm.volume = volumeToUnit(this.bgmVolume)
    return bgm
  }

  private getBgm(): HTMLAudioElement {
    if (!this.bgm) this.bgm = this.createBgm(this.bgmTrackId)
    return this.bgm
  }

  setBgmTrack(trackId: LauncherBgmId): void {
    if (trackId === this.bgmTrackId) return

    if (this.fadeFrame !== null) {
      cancelAnimationFrame(this.fadeFrame)
      this.fadeFrame = null
    }

    this.bgm?.pause()
    this.bgm = null
    this.bgmTrackId = trackId

    if (!this.bgmSuppressed && this.bgmVolume > 0) {
      const bgm = this.getBgm()
      void bgm.play().catch(() => undefined)
    }
  }

  startBgm(): void {
    if (this.bgmSuppressed || this.bgmVolume === 0) return
    const bgm = this.getBgm()
    bgm.volume = volumeToUnit(this.bgmVolume)
    void bgm.play().catch(() => undefined)
  }

  setBgmVolume(value: number): void {
    this.bgmVolume = Math.max(0, Math.min(100, value))
    if (this.bgmSuppressed) return
    const bgm = this.getBgm()
    bgm.volume = volumeToUnit(this.bgmVolume)
    if (this.bgmVolume > 0) void bgm.play().catch(() => undefined)
  }

  setSfxVolume(value: number): void {
    this.sfxVolume = Math.max(0, Math.min(100, value))
  }

  playSfx(sound: LauncherSfx): void {
    if (this.sfxVolume === 0) return
    const audio = new Audio(AUDIO_PATHS.sfx[sound])
    audio.preload = 'none'
    audio.volume = volumeToUnit(this.sfxVolume)
    void audio.play().catch(() => undefined)
  }

  fadeBgmForGame(durationMs = 2_500): void {
    this.bgmSuppressed = true
    this.fadeBgmTo(0, durationMs, true)
  }

  restoreBgm(durationMs = 1_500): void {
    this.bgmSuppressed = false
    const bgm = this.getBgm()
    if (this.bgmVolume > 0) void bgm.play().catch(() => undefined)
    this.fadeBgmTo(volumeToUnit(this.bgmVolume), durationMs)
  }

  private fadeBgmTo(targetVolume: number, durationMs: number, pauseAtZero = false): void {
    const bgm = this.getBgm()
    if (this.fadeFrame !== null) cancelAnimationFrame(this.fadeFrame)

    const startVolume = bgm.volume
    const target = clampUnit(targetVolume)
    if (durationMs <= 0 || startVolume === target) {
      bgm.volume = target
      if (pauseAtZero && target === 0) bgm.pause()
      return
    }

    const startedAt = performance.now()
    const step = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      bgm.volume = clampUnit(startVolume + (target - startVolume) * progress)
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
