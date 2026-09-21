let audioContext: AudioContext | null = null

const getAudioContext = (): AudioContext | null => {
  if (audioContext) return audioContext
  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextConstructor) return null
  audioContext = new AudioContextConstructor()
  return audioContext
}

export const playChatMessageSound = (): void => {
  const context = getAudioContext()
  if (!context) return

  void (async () => {
    if (context.state === 'suspended') await context.resume()

    const now = context.currentTime
    const master = context.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.075, now + 0.008)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
    master.connect(context.destination)

    const first = context.createOscillator()
    first.type = 'sine'
    first.frequency.setValueAtTime(560, now)
    first.frequency.exponentialRampToValueAtTime(650, now + 0.07)
    first.connect(master)
    first.start(now)
    first.stop(now + 0.08)

    const second = context.createOscillator()
    second.type = 'sine'
    second.frequency.setValueAtTime(820, now + 0.065)
    second.frequency.exponentialRampToValueAtTime(960, now + 0.16)
    second.connect(master)
    second.start(now + 0.065)
    second.stop(now + 0.18)

    const shimmerGain = context.createGain()
    shimmerGain.gain.setValueAtTime(0.0001, now + 0.1)
    shimmerGain.gain.exponentialRampToValueAtTime(0.018, now + 0.115)
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
    shimmerGain.connect(context.destination)

    const shimmer = context.createOscillator()
    shimmer.type = 'triangle'
    shimmer.frequency.setValueAtTime(1320, now + 0.1)
    shimmer.connect(shimmerGain)
    shimmer.start(now + 0.1)
    shimmer.stop(now + 0.22)

    shimmer.addEventListener(
      'ended',
      () => {
        first.disconnect()
        second.disconnect()
        shimmer.disconnect()
        master.disconnect()
        shimmerGain.disconnect()
      },
      { once: true }
    )
  })().catch(() => {
    // Chat audio is best-effort and must never interrupt message delivery.
  })
}
