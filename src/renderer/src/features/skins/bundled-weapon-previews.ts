const previewModules = import.meta.glob<string>(
  '../../../../../resources/weapon-previews/p_*.png',
  { eager: true, query: '?url', import: 'default' }
)

const previews = new Map(
  Object.entries(previewModules).map(([path, url]) => [path.split('/').at(-1), url])
)

/** Built into both Electron and web releases, independent of any game installation or API. */
export const bundledWeaponPreview = (weaponKey: string, modelPath?: string): string | undefined => {
  const stockName = modelPath?.match(/^(?:models\/)?(p_[a-z0-9_]+)\.mdl$/i)?.[1]?.toLowerCase()
  if (stockName) return previews.get(`${stockName}.png`)
  const modelKey = weaponKey === 'mp5navy' ? 'mp5' : weaponKey
  return previews.get(`p_${modelKey}.png`)
}
