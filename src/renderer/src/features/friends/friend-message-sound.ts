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

export const playFriendMessageSound = (): void => {
  const context = getAudioContext()
  if (!context) return

  void (async () => {
    if (context.state === 'suspended') await context.resume()

    const now = context.currentTime
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
    gain.connect(context.destination)

    const first = context.createOscillator()
    first.type = 'sine'
    first.frequency.setValueAtTime(620, now)
    first.connect(gain)
    first.start(now)
    first.stop(now + 0.075)

    const second = context.createOscillator()
    second.type = 'sine'
    second.frequency.setValueAtTime(820, now + 0.075)
    second.connect(gain)
    second.start(now + 0.075)
    second.stop(now + 0.18)

    second.addEventListener(
      'ended',
      () => {
        first.disconnect()
        second.disconnect()
        gain.disconnect()
      },
      { once: true }
    )
  })().catch(() => {
    // Notification audio is best-effort and must never interrupt chat delivery.
  })
}
