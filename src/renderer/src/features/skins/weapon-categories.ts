export type WeaponCategory =
  'all' | 'pistols' | 'shotguns' | 'smgs' | 'rifles' | 'snipers' | 'heavy' | 'grenades' | 'knives'

export const PISTOL_WEAPON_KEYS: readonly string[] = [
  'glock18',
  'usp',
  'p228',
  'deagle',
  'elite',
  'fiveseven'
]
export const SHOTGUN_WEAPON_KEYS: readonly string[] = ['m3', 'xm1014']
export const SMG_WEAPON_KEYS: readonly string[] = ['tmp', 'mac10', 'mp5navy', 'ump45', 'p90']
export const RIFLE_WEAPON_KEYS: readonly string[] = [
  'galil',
  'famas',
  'ak47',
  'm4a1',
  'aug',
  'sg552'
]
export const SNIPER_WEAPON_KEYS: readonly string[] = ['scout', 'awp', 'sg550', 'g3sg1']
export const MACHINE_GUN_WEAPON_KEYS: readonly string[] = ['m249']
export const GRENADE_WEAPON_KEYS: readonly string[] = ['hegrenade', 'flashbang', 'smokegrenade']
export const KNIFE_WEAPON_KEY = 'knife'

/**
 * Maps a Counter-Strike weapon key to the category used by the store filters and
 * the loadout. Shotguns used to fall through to the `heavy` fallback, which made
 * them show up under the "Machine gun" label and disappear from the loadout.
 */
export const weaponCategory = (key: string): WeaponCategory => {
  if (PISTOL_WEAPON_KEYS.includes(key)) return 'pistols'
  if (SHOTGUN_WEAPON_KEYS.includes(key)) return 'shotguns'
  if (SMG_WEAPON_KEYS.includes(key)) return 'smgs'
  if (RIFLE_WEAPON_KEYS.includes(key)) return 'rifles'
  if (SNIPER_WEAPON_KEYS.includes(key)) return 'snipers'
  if (GRENADE_WEAPON_KEYS.includes(key)) return 'grenades'
  if (key === KNIFE_WEAPON_KEY) return 'knives'
  return 'heavy'
}

/** Filter order mirrors the in-game buy menu: pistols, shotguns, SMGs, rifles, ... */
export const WEAPON_CATEGORIES: ReadonlyArray<{ id: WeaponCategory; label: string }> = [
  { id: 'all', label: 'All weapons' },
  { id: 'pistols', label: 'Pistols' },
  { id: 'shotguns', label: 'Shotguns' },
  { id: 'smgs', label: 'SMGs' },
  { id: 'rifles', label: 'Rifles' },
  { id: 'snipers', label: 'Snipers' },
  { id: 'heavy', label: 'Machine gun' },
  { id: 'grenades', label: 'Grenades' },
  { id: 'knives', label: 'Knife' }
]

export const weaponCategoryLabel = (category: WeaponCategory): string =>
  WEAPON_CATEGORIES.find(({ id }) => id === category)?.label ?? category
