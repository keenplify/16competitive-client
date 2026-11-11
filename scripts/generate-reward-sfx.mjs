/* eslint-disable @typescript-eslint/explicit-function-return-type -- JavaScript tooling cannot declare TypeScript return types. */
// Original, deterministic synthesized reward cues. No samples or external music.
// Run: node scripts/generate-reward-sfx.mjs
import { mkdir, writeFile } from 'node:fs/promises'
const directory = new URL('../src/renderer/public/audio/sfx/', import.meta.url)
await mkdir(directory, { recursive: true })
const rate = 44100
const tiers = ['field', 'forge', 'strike', 'vanguard', 'neon', 'crimson', 'relic', 'vault']
for (const [tier, name] of tiers.entries()) {
  const duration = 0.72
  const samples = new Float64Array(Math.ceil(rate * duration))
  let seed = 1600 + tier
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2147483648 - 1
  }
  const notes = [0, 7, 12, 16, 19, 24].slice(0, 3 + Math.floor(tier / 2))
  const root = 440 * 2 ** ((tier % 3) / 12)
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate
    // Snappy cinematic impact, upward air sweep, then a sparkling major arpeggio.
    let value =
      0.48 * Math.sin(2 * Math.PI * (85 * t + 22 * (1 - Math.exp(-t * 35)))) * Math.exp(-t * 30)
    value += noise() * Math.exp(-t * 40) * 0.1
    value += Math.sin(2 * Math.PI * (900 * t + 4600 * t * t)) * Math.exp(-t * 22) * 0.08
    for (const [n, semitones] of notes.entries()) {
      const age = t - 0.025 - n * 0.043
      if (age < 0) continue
      const frequency = root * 2 ** (semitones / 12)
      const envelope = (1 - Math.exp(-age * 450)) * Math.exp(-age * (8.5 - tier * 0.35))
      value +=
        envelope *
        (Math.sin(2 * Math.PI * frequency * age) +
          0.22 * Math.sin(2 * Math.PI * frequency * 2.002 * age)) *
        0.18
      if (tier >= 4) value += envelope * Math.sin(2 * Math.PI * frequency * 3 * age) * 0.025
    }
    const fade = Math.min(1, t / 0.003, (duration - t) / 0.055)
    samples[i] = Math.tanh(value * 1.3) * fade
  }
  const peak = samples.reduce((p, n) => Math.max(p, Math.abs(n)), 0)
  const wav = Buffer.alloc(44 + samples.length * 2)
  wav.write('RIFF')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++)
    wav.writeInt16LE(Math.round((samples[i] / peak) * 0.88 * 32767), 44 + i * 2)
  await writeFile(new URL(`reward-${name}.wav`, directory), wav)
}
console.log(`Generated ${tiers.length} original 720 ms reward sounds.`)
