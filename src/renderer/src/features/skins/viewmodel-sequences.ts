export type PreviewSequenceAction = 'draw' | 'idle' | 'fire' | 'reload' | 'charge' | 'throw'
type Sequence = { label: string }
const labels: Record<PreviewSequenceAction, readonly string[]> = {
  draw: ['draw', 'deploy', 'draw1', 'select'],
  idle: ['idle1', 'idle', 'idle0', 'idle2'],
  fire: [
    'shoot1',
    'shoot',
    'fire',
    'fire1',
    'attack1',
    'midslash1',
    'slash1',
    'slash2',
    'combo1',
    'combo2',
    'stab',
    'throw'
  ],
  reload: ['reload', 'reload1'],
  charge: ['charge', 'pullpin', 'pull_pin', 'pinpull'],
  throw: ['throw', 'throw1', 'throw2']
}
const normalize = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Custom skins often rename CS animation labels, while retaining their weapon slots. */
export function resolvePreviewSequences(sequences: readonly Sequence[], knife: boolean) {
  const names = sequences.map((sequence) => normalize(sequence.label))
  const find = (aliases: readonly string[]): number => {
    for (const alias of aliases) {
      const index = names.indexOf(normalize(alias))
      if (index >= 0) return index
    }
    return -1
  }
  const idle = Math.max(0, find(labels.idle))
  return Object.fromEntries(
    Object.entries(labels).map(([action, aliases]) => {
      const found = find(aliases)
      // CS 1.6 knife slot 3 is draw and slot 6 is the primary slash. Use slots
      // only when a custom compiler has discarded all recognizable aliases.
      const fallback =
        knife && sequences.length >= 8
          ? action === 'draw'
            ? 3
            : action === 'fire'
              ? 6
              : idle
          : idle
      return [action, found >= 0 ? found : fallback]
    })
  ) as Record<PreviewSequenceAction, number>
}
