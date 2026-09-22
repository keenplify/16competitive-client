import type { AuthPlayer } from '../../../../shared/auth'
import type { Party, PartyMember } from '../../../../shared/party'
import type { Skin } from '../../../../shared/skins'
import { LOBBY_PLAYER_MODELS } from './party-models'

export const MARKETING_LOBBY_ENABLED = import.meta.env.MODE === 'marketing'

const MARKETING_PLAYERS = [
  { username: 'f0rest', mmrOffset: 184 },
  { username: 'HeatoN', mmrOffset: 121 },
  { username: 'SpawN', mmrOffset: 73 },
  { username: 'Potti', mmrOffset: 39 }
] as const

const shuffled = <T>(values: readonly T[]): T[] => {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
    const swapIndex = Math.floor(random * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

const memberWithSkin = (
  id: string,
  username: string,
  mmr: number,
  skin: Skin,
  slot: number
): PartyMember => ({
  id,
  username,
  mmr,
  lobbyPlayerModel: LOBBY_PLAYER_MODELS[slot % LOBBY_PLAYER_MODELS.length],
  lobbyWeaponSkinId: skin.id,
  lobbyWeaponKey: skin.weaponKey,
  lobbyWeaponModelPath: skin.playerModelPath
})

export interface MarketingLobby {
  party: Party
  currentPlayerMember: PartyMember
}

/** Builds renderer-only showcase data. It never creates or changes a backend party. */
export const buildMarketingLobby = (player: AuthPlayer, catalog: Skin[]): MarketingLobby => {
  const availableSkins = shuffled(catalog.filter((skin) => skin.playerModelPath !== null))
  if (availableSkins.length === 0) {
    throw new Error('The server did not return any skins with lobby models.')
  }

  // Prefer five different skins, but allow a small development catalog to wrap.
  const selectedSkins = Array.from(
    { length: 5 },
    (_, index) => availableSkins[index % availableSkins.length]
  )
  const currentPlayerMember = memberWithSkin(
    player.id,
    player.username,
    player.mmr,
    selectedSkins[0],
    0
  )
  const guests = MARKETING_PLAYERS.map(({ username, mmrOffset }, index) =>
    memberWithSkin(
      `marketing-player-${index + 1}`,
      username,
      Math.max(0, player.mmr + mmrOffset),
      selectedSkins[index + 1],
      index + 1
    )
  )

  return {
    currentPlayerMember,
    party: {
      id: 'marketing-lobby',
      leaderId: player.id,
      joinSecret: 'local-marketing-lobby',
      members: [currentPlayerMember, ...guests]
    }
  }
}
