import { create } from 'zustand'
import type {
  CustomGameRoom,
  CustomGameSettings,
  CustomGameSettingsUpdate
} from '../../../../shared/custom-games'
import { useMatchmakingStore } from './matchmaking.store'

interface CustomGamesState {
  playView: 'matchmaking' | 'custom'
  createModalOpen: boolean
  rooms: CustomGameRoom[]
  currentRoom: CustomGameRoom | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  movingServer: boolean
  refresh: () => Promise<void>
  restoreRoom: (hostApiUrl: string) => Promise<void>
  setPlayView: (view: 'matchmaking' | 'custom') => void
  openCreateModal: () => void
  closeCreateModal: () => void
  createRoom: (settings: CustomGameSettings) => Promise<boolean>
  updateRoom: (settings: CustomGameSettingsUpdate) => Promise<void>
  joinRoom: (roomId: string, password?: string, hostApiUrl?: string) => Promise<boolean>
  leaveRoom: () => Promise<void>
  startRoom: () => Promise<void>
  addBot: (team?: 1 | 2) => Promise<void>
  setTeamCapacity: (team: 1 | 2, capacity: number) => Promise<void>
  moveMember: (playerId: string, team: 0 | 1 | 2) => Promise<void>
  moveServer: (targetNodeId: string) => Promise<boolean>
  kick: (playerId: string) => Promise<void>
  reset: () => void
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : 'Custom game request failed'

export const useCustomGamesStore = create<CustomGamesState>((set, get) => ({
  playView: 'matchmaking',
  createModalOpen: false,
  rooms: [],
  currentRoom: null,
  status: 'idle',
  error: null,
  movingServer: false,
  setPlayView: (playView) => set({ playView }),
  openCreateModal: () => set({ createModalOpen: true, error: null }),
  closeCreateModal: () => set({ createModalOpen: false }),
  restoreRoom: async (hostApiUrl) => {
    const previousRoom = get().currentRoom
    const matchId = useMatchmakingStore.getState().match?.matchId
    try {
      const currentRoom = await window.api.customGames.mine(hostApiUrl)
      // Discard a response if a leave/join or match transition happened meanwhile.
      if (
        get().currentRoom !== previousRoom ||
        useMatchmakingStore.getState().match?.matchId !== matchId
      )
        return
      set({ currentRoom, error: null })
    } catch (error) {
      if (useMatchmakingStore.getState().match?.matchId === matchId) set({ error: message(error) })
    }
  },
  refresh: async () => {
    set({ status: 'loading', error: null })
    try {
      const [rooms, currentRoom] = await Promise.all([
        window.api.customGames.list(useMatchmakingStore.getState().selectedNodeId),
        window.api.customGames.mine(
          get().currentRoom?.hostApiUrl ?? useMatchmakingStore.getState().match?.hostApiUrl
        )
      ])
      set({ rooms, currentRoom, status: 'ready' })
    } catch (error) {
      set({ status: 'error', error: message(error) })
    }
  },
  createRoom: async (settings) => {
    set({ error: null })
    try {
      const currentRoom = await window.api.customGames.create(settings)
      set({ currentRoom, status: 'ready' })
      await get().refresh()
      return true
    } catch (error) {
      set({ error: message(error) })
      return false
    }
  },
  updateRoom: async (settings) => {
    const room = get().currentRoom
    if (!room) return
    set({ error: null })
    try {
      set({ currentRoom: await window.api.customGames.update(room.id, settings, room.hostApiUrl) })
      await get().refresh()
    } catch (error) {
      set({ error: message(error) })
    }
  },
  joinRoom: async (roomId, password, hostApiUrl) => {
    set({ error: null })
    try {
      set({ currentRoom: await window.api.customGames.join(roomId, password, hostApiUrl) })
      await get().refresh()
      return true
    } catch (error) {
      set({ error: message(error) })
      return false
    }
  },
  leaveRoom: async () => {
    const room = get().currentRoom
    if (!room) return
    set({ error: null })
    try {
      await window.api.customGames.leave(room.id, room.hostApiUrl)
      if (room.matchId) useMatchmakingStore.getState().exitCustomMatch(room.matchId)
      set({ currentRoom: null })
      await get().refresh()
    } catch (error) {
      set({ error: message(error) })
    }
  },
  startRoom: async () => {
    const room = get().currentRoom
    if (!room) return
    set({ error: null })
    try {
      set({ currentRoom: await window.api.customGames.start(room.id, room.hostApiUrl) })
    } catch (error) {
      set({ error: message(error) })
    }
  },
  addBot: async (team) => {
    const room = get().currentRoom
    if (!room) return
    set({ error: null })
    try {
      const roomWithBot = await window.api.customGames.addBot(room.id, room.hostApiUrl)
      const previousMemberIds = new Set(room.members.map(({ id }) => id))
      const addedBot = roomWithBot.members.find(
        (member) => member.isBot && !previousMemberIds.has(member.id)
      )
      const currentRoom =
        team && addedBot && addedBot.team !== team
          ? await window.api.customGames.moveMember(room.id, addedBot.id, team, room.hostApiUrl)
          : roomWithBot
      set({ currentRoom })
    } catch (error) {
      set({ error: message(error) })
    }
  },
  setTeamCapacity: async (team, capacity) => {
    const room = get().currentRoom
    if (!room) return
    set({ error: null })
    try {
      set({
        currentRoom: await window.api.customGames.setTeamCapacity(
          room.id,
          team,
          capacity,
          room.hostApiUrl
        )
      })
    } catch (error) {
      set({ error: message(error) })
    }
  },
  moveMember: async (playerId, team) => {
    const room = get().currentRoom
    if (!room) return
    set({ error: null })
    try {
      set({
        currentRoom: await window.api.customGames.moveMember(
          room.id,
          playerId,
          team,
          room.hostApiUrl
        )
      })
    } catch (error) {
      set({ error: message(error) })
    }
  },
  moveServer: async (targetNodeId) => {
    const room = get().currentRoom
    if (!room || get().movingServer) return false
    set({ error: null, movingServer: true })
    try {
      set({
        currentRoom: await window.api.customGames.moveServer(room.id, targetNodeId, room.hostApiUrl)
      })
      return true
    } catch (error) {
      set({ error: message(error) })
      return false
    } finally {
      set({ movingServer: false })
    }
  },
  kick: async (playerId) => {
    const room = get().currentRoom
    if (!room) return
    set({ error: null })
    try {
      set({
        currentRoom: await window.api.customGames.kick(room.id, playerId, room.hostApiUrl)
      })
      await get().refresh()
    } catch (error) {
      set({ error: message(error) })
    }
  },
  reset: () => set({ rooms: [], currentRoom: null, status: 'idle', error: null })
}))
