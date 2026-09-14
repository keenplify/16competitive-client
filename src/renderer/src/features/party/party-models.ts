import type { PartyMember } from '../../../../shared/party'

export const LOBBY_PLAYER_MODELS = [
  'player/arctic/arctic.mdl',
  'player/gign/gign.mdl',
  'player/gsg9/gsg9.mdl',
  'player/guerilla/guerilla.mdl',
  'player/leet/leet.mdl',
  'player/sas/sas.mdl',
  'player/terror/terror.mdl',
  'player/urban/urban.mdl'
] as const

const LOBBY_PRESENTATION_MODELS = Object.fromEntries(
  LOBBY_PLAYER_MODELS.map((modelPath) => {
    const modelName = modelPath.split('/')[1]
    return [modelPath, `lobby/${modelName}_lobby.mdl`]
  })
) as Readonly<Record<string, string>>

/** Uses a bundled, lobby-animated variant while preserving the selected CS character model. */
export const presentationModelPath = (modelPath: string): string =>
  LOBBY_PRESENTATION_MODELS[modelPath.toLowerCase()] ?? modelPath

export const modelForSlot = (slot: number, member: PartyMember | null): string => {
  const seed = member?.id ?? `open-slot-${slot}`
  let hash = 0
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return LOBBY_PLAYER_MODELS[Math.abs(hash + slot * 17) % LOBBY_PLAYER_MODELS.length]
}
