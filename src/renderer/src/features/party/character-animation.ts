/** Shared by party scenes and character previews. Resolve names, never assume sequence order. */
interface CharacterSequences {
  sequences: readonly { label: string; activity?: number }[]
}

const isGrenadeWeapon = (key: string): boolean =>
  ['hegrenade', 'flashbang', 'smokegrenade'].includes(key)

const WEAPON_ANIMATION_FAMILY: Record<string, string> = {
  usp: 'onehanded',
  glock18: 'onehanded',
  p228: 'onehanded',
  deagle: 'onehanded',
  fiveseven: 'onehanded',
  tmp: 'onehanded',
  mac10: 'onehanded',
  elite: 'dualpistols',
  mp5navy: 'mp5',
  sg552: 'mp5',
  g3sg1: 'mp5',
  p90: 'carbine',
  ump45: 'carbine',
  aug: 'carbine',
  famas: 'carbine',
  m4a1: 'rifle',
  awp: 'rifle',
  scout: 'rifle',
  sg550: 'rifle',
  ak47: 'ak47',
  galil: 'ak47',
  m249: 'm249',
  knife: 'knife'
}

const LOBBY_SEQUENCE_BY_WEAPON: Record<string, string> = {
  usp: 'idle_pistol',
  glock18: 'idle_pistol',
  p228: 'idle_pistol',
  deagle: 'idle_pistol',
  fiveseven: 'idle_pistol',
  elite: 'idle_pistol',
  awp: 'idle_sniper',
  scout: 'idle_sniper',
  g3sg1: 'idle_sniper',
  sg550: 'idle_sniper',
  mp5navy: 'idle_smg',
  tmp: 'idle_smg',
  mac10: 'idle_smg',
  ump45: 'idle_smg',
  p90: 'idle_smg',
  knife: 'idle_knife'
}

export const lobbySequenceLabelFor = (weaponKey: string): string =>
  isGrenadeWeapon(weaponKey)
    ? 'ref_aim_grenade'
    : (LOBBY_SEQUENCE_BY_WEAPON[weaponKey] ?? 'idle_rifle')

export const characterAnimationLabels = (weaponKey = 'ak47'): readonly string[] => {
  const family = isGrenadeWeapon(weaponKey) ? 'grenade' : WEAPON_ANIMATION_FAMILY[weaponKey]
  return [
    lobbySequenceLabelFor(weaponKey),
    ...(family ? [`ref_aim_${family}`] : []),
    'idle1',
    'idle'
  ]
}

export const resolveAnimationIndex = (
  model: CharacterSequences,
  labels: readonly string[]
): number => {
  for (const label of labels) {
    const index = model.sequences.findIndex(
      (sequence) => sequence.label.toLowerCase() === label.toLowerCase()
    )
    if (index >= 0) return index
  }
  // GoldSrc ACT_IDLE is 1; custom authors may use their own sequence labels.
  const idleActivity = model.sequences.findIndex((sequence) => sequence.activity === 1)
  return idleActivity >= 0 ? idleActivity : 0
}

export const lobbyAnimationIndexFor = (model: CharacterSequences, weaponKey: string): number =>
  resolveAnimationIndex(model, characterAnimationLabels(weaponKey))
