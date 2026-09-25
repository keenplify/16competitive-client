import type { AuthPlayer } from '../../../../shared/auth'
import type { PartyChatEvent } from '../../../../shared/matchmaking'
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
  lobbyWeaponModelPath: skin.playerModelPath,
  clientMode: 'desktop'
})

export interface MarketingLobby {
  party: Party
  currentPlayerMember: PartyMember
  chatEntries: PartyChatEvent[]
}

const buildMarketingChat = (partyId: string, members: readonly PartyMember[]): PartyChatEvent[] => {
  const now = Date.now()
  const message = (
    index: number,
    sender: PartyMember,
    text: string,
    secondsAgo: number
  ): PartyChatEvent => ({
    type: 'party_chat_message',
    id: `marketing-chat-${index}`,
    partyId,
    sender: { id: sender.id, username: sender.username },
    message: text,
    sentAt: new Date(now - secondsAgo * 1_000).toISOString()
  })

  return [
    {
      type: 'party_chat_notification',
      id: 'marketing-chat-party-ready',
      partyId,
      code: 'MEMBER_JOINED',
      message: 'Party is full. 5 / 5 players ready.',
      sentAt: new Date(now - 94_000).toISOString()
    },
    message(1, members[1], 'warmup then queue?', 82),
    message(2, members[2], 'ready when you are', 65),
    message(3, members[3], 'that loadout looks clean', 43),
    message(4, members[4], "let's run Dust II", 26),
    message(5, members[0], "let's go", 9)
  ]
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

  const party: Party = {
    id: 'marketing-lobby',
    leaderId: player.id,
    joinSecret: 'local-marketing-lobby',
    members: [currentPlayerMember, ...guests]
  }

  return {
    currentPlayerMember,
    party,
    chatEntries: buildMarketingChat(party.id, party.members)
  }
}
