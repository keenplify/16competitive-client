import { randomUUID } from 'node:crypto'
import { createConnection, type Socket } from 'node:net'
import { join } from 'node:path'
import type { MatchmakingMode } from '../shared/matchmaking'
import { getMatchmakingModeLabel } from '../shared/matchmaking'
import type { Party } from '../shared/party'
import { DISCORD_CLIENT_ID, DISCORD_IPC_PATH, DISCORD_LARGE_IMAGE_KEY } from './config'

const HANDSHAKE_OPCODE = 0
const FRAME_OPCODE = 1
const CLOSE_OPCODE = 2
const PING_OPCODE = 3
const PONG_OPCODE = 4
const MAX_FRAME_BYTES = 1024 * 1024
const IPC_CONNECT_TIMEOUT_MS = 350
// Discord's desktop client answers the IPC handshake much slower than the pipe
// connect itself: measured at roughly 1.0-2.6s on an idle desktop, and longer
// while its renderer is busy. A 2s ceiling therefore tore the socket down just
// before READY arrived, so Rich Presence was never set. Waiting longer is safe
// because a missing Discord pipe fails to connect almost instantly, which is
// handled by IPC_CONNECT_TIMEOUT_MS above.
const READY_TIMEOUT_MS = 20_000
const RECONNECT_DELAY_MS = 15_000
const PARTY_MAX_SIZE = 5
const CLIENT_ID_PATTERN = /^\d{17,20}$/

interface DiscordActivity {
  type: 0
  details: string
  state: string
  timestamps?: { start: number }
  assets?: {
    large_image: string
    large_text: string
  }
  party?: {
    id: string
    size: [number, number]
  }
  secrets?: {
    join: string
  }
  instance: false
}

interface PresenceState {
  authenticated: boolean
  partyId: string | null
  partySize: number
  partyJoinSecret: string | null
  queue: { mode: MatchmakingMode; mapIds: string[] } | null
  match: { mode: MatchmakingMode; mapId: string } | null
  inGame: boolean
  matchStarted: boolean
  gameStartedAt: number | null
}

const initialState = (): PresenceState => ({
  authenticated: false,
  partyId: null,
  partySize: 0,
  partyJoinSecret: null,
  queue: null,
  match: null,
  inGame: false,
  matchStarted: false,
  gameStartedAt: null
})

const getDiscordIpcPaths = (): string[] => {
  const configuredPaths = DISCORD_IPC_PATH
    ? DISCORD_IPC_PATH.split(process.platform === 'win32' ? ';' : ':')
        .map((path) => path.trim())
        .filter(Boolean)
    : []

  if (process.platform === 'win32') {
    return [
      ...configuredPaths,
      ...Array.from({ length: 10 }, (_, index) => `\\\\?\\pipe\\discord-ipc-${index}`)
    ]
  }

  const runtimeDirectory = process.env.XDG_RUNTIME_DIR
  const roots = [
    runtimeDirectory,
    process.env.TMPDIR,
    process.env.TMP,
    process.env.TEMP,
    '/tmp'
  ].filter((value): value is string => Boolean(value))

  // Native Vesktop uses the regular Discord IPC location. Its Flatpak build
  // hosts arRPC inside the app runtime mount instead, which is visible to
  // host processes at this path.
  const vesktopFlatpakRoot = runtimeDirectory
    ? join(runtimeDirectory, '.flatpak', 'dev.vencord.Vesktop', 'xdg-run')
    : null
  const allRoots = vesktopFlatpakRoot ? [...roots, vesktopFlatpakRoot] : roots

  return [
    ...configuredPaths,
    ...Array.from(new Set(allRoots)).flatMap((root) =>
      Array.from({ length: 10 }, (_, index) => join(root, `discord-ipc-${index}`))
    )
  ]
}

const openIpcSocket = (path: string): Promise<Socket> =>
  new Promise((resolveSocket, rejectSocket) => {
    const socket = createConnection(path)
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      socket.destroy()
      rejectSocket(new Error('Discord IPC connection timed out'))
    }, IPC_CONNECT_TIMEOUT_MS)
    timer.unref?.()

    const cleanup = (): void => {
      clearTimeout(timer)
      socket.removeListener('connect', onConnect)
      socket.removeListener('error', onError)
    }
    const onConnect = (): void => {
      if (settled) return
      settled = true
      cleanup()
      resolveSocket(socket)
    }
    const onError = (error: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      socket.destroy()
      rejectSocket(error)
    }

    socket.once('connect', onConnect)
    socket.once('error', onError)
  })

class DiscordPresence {
  private state = initialState()
  private socket: Socket | null = null
  private ready = false
  private receiveBuffer = Buffer.alloc(0)
  private connectPromise: Promise<void> | null = null
  private readyWaiter: {
    socket: Socket
    resolve: () => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  } | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private lastSentActivityKey: string | null = null
  private stopped = false
  private invalidClientIdLogged = false
  private connectFailureLogged = false
  private joinHandler: ((secret: string) => Promise<void>) | null = null

  setJoinHandler(handler: (secret: string) => Promise<void>): void {
    this.joinHandler = handler
  }

  setAuthenticated(authenticated: boolean): void {
    this.state.authenticated = authenticated
    if (!authenticated) {
      this.state.queue = null
      this.state.match = null
      this.state.inGame = false
      this.state.matchStarted = false
      this.state.gameStartedAt = null
      this.state.partyId = null
      this.state.partySize = 0
      this.state.partyJoinSecret = null
    }
    this.publish()
  }

  setParty(party: Party | null): void {
    this.state.partyId = party?.id ?? null
    this.state.partySize = party?.members.length ?? 0
    this.state.partyJoinSecret = party?.joinSecret ?? null
    this.publish()
  }

  setQueue(mode: MatchmakingMode, mapIds: string[]): void {
    this.state.queue = { mode, mapIds: [...mapIds] }
    this.publish()
  }

  clearQueue(): void {
    this.state.queue = null
    this.publish()
  }

  setMatch(mode: MatchmakingMode, mapId: string): void {
    this.state.queue = null
    this.state.match = { mode, mapId }
    this.state.inGame = false
    this.state.matchStarted = false
    this.state.gameStartedAt = null
    this.publish()
  }

  setInGame(inGame: boolean): void {
    this.state.inGame = inGame
    if (inGame) {
      this.state.matchStarted = true
      this.state.gameStartedAt ??= Math.floor(Date.now() / 1000)
    }
    this.publish()
  }

  finishMatch(): void {
    this.state.match = null
    this.state.inGame = false
    this.state.matchStarted = false
    this.state.gameStartedAt = null
    this.publish()
  }

  reset(): void {
    this.state = initialState()
    this.publish()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.ready && this.socket) {
      this.sendActivity(null)
    }
    this.rejectReadyWaiter(new Error('Discord Rich Presence stopped'))
    this.socket?.destroy()
    this.socket = null
    this.ready = false
    this.receiveBuffer = Buffer.alloc(0)
    this.lastSentActivityKey = null
  }

  private buildActivity(): DiscordActivity | null {
    if (!this.state.authenticated) return null

    const assets = DISCORD_LARGE_IMAGE_KEY
      ? { large_image: DISCORD_LARGE_IMAGE_KEY, large_text: '1.6 Competitive' }
      : undefined
    const party =
      this.state.partyId && this.state.partySize > 0
        ? {
            id: this.state.partyId,
            size: [this.state.partySize, PARTY_MAX_SIZE] as [number, number]
          }
        : undefined
    const secrets =
      party &&
      !this.state.queue &&
      !this.state.match &&
      this.state.partyJoinSecret &&
      this.state.partySize < PARTY_MAX_SIZE
        ? { join: this.state.partyJoinSecret }
        : undefined

    if (this.state.match) {
      const mode = getMatchmakingModeLabel(this.state.match.mode)
      if (this.state.inGame) {
        return {
          type: 0,
          details: `${mode} • In Game`,
          state: `Map: ${this.state.match.mapId}`,
          ...(this.state.gameStartedAt ? { timestamps: { start: this.state.gameStartedAt } } : {}),
          ...(party ? { party } : {}),
          ...(assets ? { assets } : {}),
          instance: false
        }
      }

      return {
        type: 0,
        details: this.state.matchStarted ? 'Match In Progress' : 'Match Found',
        state: `${mode} • ${this.state.match.mapId}`,
        ...(party ? { party } : {}),
        ...(assets ? { assets } : {}),
        instance: false
      }
    }

    if (this.state.queue) {
      const mode = getMatchmakingModeLabel(this.state.queue.mode)
      const mapText =
        this.state.queue.mapIds.length === 1
          ? `Map: ${this.state.queue.mapIds[0]}`
          : `${this.state.queue.mapIds.length} maps selected`
      return {
        type: 0,
        details: 'Searching for Match',
        state: `${mode} • ${mapText}`,
        ...(party ? { party } : {}),
        ...(assets ? { assets } : {}),
        instance: false
      }
    }

    if (party) {
      return {
        type: 0,
        details: 'In Lobby',
        state: 'In a Party',
        ...(assets ? { assets } : {}),
        ...(secrets ? { secrets } : {}),
        party,
        instance: false
      }
    }

    return {
      type: 0,
      details: 'In Lobby',
      state: 'Ready to play',
      ...(assets ? { assets } : {}),
      instance: false
    }
  }

  private publish(): void {
    const activity = this.buildActivity()
    if (!this.isConfigured()) return

    if (this.ready && this.socket) {
      const key = JSON.stringify(activity)
      if (key !== this.lastSentActivityKey) this.sendActivity(activity)
      return
    }

    if (activity) this.requestConnection()
  }

  private isConfigured(): boolean {
    if (!DISCORD_CLIENT_ID) return false
    if (CLIENT_ID_PATTERN.test(DISCORD_CLIENT_ID)) return true
    if (!this.invalidClientIdLogged) {
      this.invalidClientIdLogged = true
      console.warn('[DiscordPresence] DISCORD_CLIENT_ID is not a valid Discord application ID')
    }
    return false
  }

  private requestConnection(): void {
    // A pending reconnect already owns the next attempt. Without this guard every
    // state change that republishes an activity (party refresh, queue updates)
    // opened a fresh Discord IPC socket, which kept Discord answering the
    // handshake late and made the whole connection unreliable.
    if (this.stopped || this.connectPromise || this.reconnectTimer) return
    if (!this.isConfigured()) return

    this.connectPromise = this.connect()
      .then(() => {
        this.flushCurrentActivity()
      })
      .catch((error: unknown) => {
        if (!this.connectFailureLogged) {
          this.connectFailureLogged = true
          console.warn(
            '[DiscordPresence] Rich Presence unavailable:',
            error instanceof Error ? error.message : String(error)
          )
        }
      })
      .finally(() => {
        this.connectPromise = null
        if (!this.ready) this.scheduleReconnect()
      })
  }

  private async connect(): Promise<void> {
    for (const path of getDiscordIpcPaths()) {
      let socket: Socket
      try {
        socket = await openIpcSocket(path)
      } catch {
        continue
      }

      this.attachSocket(socket)
      const readyPromise = this.waitForReady(socket)
      this.writeJsonFrame(HANDSHAKE_OPCODE, { v: 1, client_id: DISCORD_CLIENT_ID })

      try {
        await readyPromise
        console.info('[DiscordPresence] connected to Discord desktop')
        return
      } catch {
        if (this.socket === socket) {
          this.socket = null
          this.ready = false
          this.receiveBuffer = Buffer.alloc(0)
        }
        socket.destroy()
      }
    }

    throw new Error('Discord desktop IPC is unavailable')
  }

  private attachSocket(socket: Socket): void {
    this.socket?.destroy()
    this.socket = socket
    this.ready = false
    this.receiveBuffer = Buffer.alloc(0)
    this.lastSentActivityKey = null

    socket.on('data', (chunk) => this.handleData(socket, chunk))
    socket.on('error', () => this.handleSocketClosed(socket))
    socket.on('close', () => this.handleSocketClosed(socket))
  }

  private waitForReady(socket: Socket): Promise<void> {
    this.rejectReadyWaiter(new Error('Discord IPC connection replaced'))

    return new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => {
        if (this.readyWaiter?.socket !== socket) return
        this.readyWaiter = null
        rejectReady(new Error('Discord IPC handshake timed out'))
      }, READY_TIMEOUT_MS)
      timer.unref?.()
      this.readyWaiter = { socket, resolve: resolveReady, reject: rejectReady, timer }
    })
  }

  private resolveReady(socket: Socket): void {
    const waiter = this.readyWaiter
    if (!waiter || waiter.socket !== socket) return
    clearTimeout(waiter.timer)
    this.readyWaiter = null
    waiter.resolve()
  }

  private rejectReadyWaiter(error: Error): void {
    const waiter = this.readyWaiter
    if (!waiter) return
    clearTimeout(waiter.timer)
    this.readyWaiter = null
    waiter.reject(error)
  }

  private handleData(socket: Socket, chunk: Buffer): void {
    if (this.socket !== socket) return
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk])

    while (this.receiveBuffer.length >= 8) {
      const opcode = this.receiveBuffer.readUInt32LE(0)
      const payloadLength = this.receiveBuffer.readUInt32LE(4)
      if (payloadLength > MAX_FRAME_BYTES) {
        socket.destroy()
        return
      }
      if (this.receiveBuffer.length < 8 + payloadLength) return

      const payload = this.receiveBuffer.subarray(8, 8 + payloadLength)
      this.receiveBuffer = this.receiveBuffer.subarray(8 + payloadLength)

      if (opcode === PING_OPCODE) {
        this.writeRawFrame(PONG_OPCODE, payload)
        continue
      }
      if (opcode === CLOSE_OPCODE) {
        socket.destroy()
        return
      }
      if (opcode !== FRAME_OPCODE) continue

      let message: unknown
      try {
        message = JSON.parse(payload.toString('utf8'))
      } catch {
        continue
      }
      if (typeof message !== 'object' || message === null) continue
      const frame = message as Record<string, unknown>

      if (frame.cmd === 'DISPATCH' && frame.evt === 'READY') {
        this.ready = true
        this.writeJsonFrame(FRAME_OPCODE, {
          cmd: 'SUBSCRIBE',
          args: {},
          evt: 'ACTIVITY_JOIN',
          nonce: randomUUID()
        })
        this.resolveReady(socket)
        continue
      }
      if (frame.cmd === 'DISPATCH' && frame.evt === 'ACTIVITY_JOIN') {
        const data =
          typeof frame.data === 'object' && frame.data !== null
            ? (frame.data as Record<string, unknown>)
            : null
        const secret = data?.secret
        if (
          typeof secret === 'string' &&
          secret.length >= 2 &&
          secret.length <= 128 &&
          this.joinHandler
        ) {
          void this.joinHandler(secret).catch((error: unknown) => {
            console.warn(
              '[DiscordPresence] activity join handler failed',
              error instanceof Error ? error.message : String(error)
            )
          })
        }
        continue
      }
      if (frame.evt === 'ERROR') {
        const data =
          typeof frame.data === 'object' && frame.data !== null
            ? (frame.data as Record<string, unknown>)
            : null
        console.warn('[DiscordPresence] Discord rejected an RPC request', {
          code: data?.code,
          message: data?.message
        })
      }
    }
  }

  private handleSocketClosed(socket: Socket): void {
    if (this.socket !== socket) return
    this.socket = null
    this.ready = false
    this.receiveBuffer = Buffer.alloc(0)
    this.lastSentActivityKey = null
    this.rejectReadyWaiter(new Error('Discord IPC connection closed'))
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (
      this.stopped ||
      this.reconnectTimer ||
      this.connectPromise ||
      !this.buildActivity() ||
      !this.isConfigured()
    ) {
      return
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.requestConnection()
    }, RECONNECT_DELAY_MS)
    this.reconnectTimer.unref?.()
  }

  private flushCurrentActivity(): void {
    if (!this.ready || !this.socket) return
    const activity = this.buildActivity()
    const key = JSON.stringify(activity)
    if (key !== this.lastSentActivityKey) this.sendActivity(activity)
  }

  private sendActivity(activity: DiscordActivity | null): void {
    if (!this.socket || !this.ready) return
    this.writeJsonFrame(FRAME_OPCODE, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity },
      nonce: randomUUID()
    })
    this.lastSentActivityKey = JSON.stringify(activity)
  }

  private writeJsonFrame(opcode: number, payload: object): void {
    this.writeRawFrame(opcode, Buffer.from(JSON.stringify(payload), 'utf8'))
  }

  private writeRawFrame(opcode: number, payload: Buffer): void {
    const socket = this.socket
    if (!socket || socket.destroyed || !socket.writable) return
    const frame = Buffer.allocUnsafe(8 + payload.length)
    frame.writeUInt32LE(opcode, 0)
    frame.writeUInt32LE(payload.length, 4)
    payload.copy(frame, 8)
    socket.write(frame)
  }
}

export const discordPresence = new DiscordPresence()
