import { createSocket } from 'node:dgram'
const request = Buffer.concat([
  Buffer.from([255, 255, 255, 255, 0x54]),
  Buffer.from('Source Engine Query\0')
])
export interface ServerInfo {
  map: string
  players: number
  maxPlayers: number
  pingMs: number
}
export function parseServerInfo(packet: Buffer): Omit<ServerInfo, 'pingMs'> | null {
  if (packet.length < 6 || packet.length > 4096 || packet.readInt32LE(0) !== -1) return null
  let cursor = 5
  const string = (): string => {
    const end = packet.indexOf(0, cursor)
    if (end < cursor || end - cursor > 512) throw new Error('Invalid server string')
    const result = Array.from(packet.toString('utf8', cursor, end))
      .filter((char) => char.charCodeAt(0) > 31)
      .join('')
    cursor = end + 1
    return result
  }
  try {
    if (packet[4] === 0x49)
      cursor++ // modern protocol version
    else if (packet[4] === 0x6d)
      string() // legacy advertised address
    else return null
    string() // server name: the partner's configured name remains the card label
    const map = string(),
      folder = string()
    string() // game description
    if (folder.toLowerCase() !== 'cstrike' || !/^[a-z0-9_-]{1,64}$/i.test(map)) return null
    if (packet[4] === 0x49) cursor += 2 // app ID
    if (cursor + 2 > packet.length) return null
    const players = packet[cursor],
      maxPlayers = packet[cursor + 1]
    if (!maxPlayers || maxPlayers > 64 || players > maxPlayers) return null
    return { map, players, maxPlayers }
  } catch {
    return null
  }
}
/** Caller resolves and approves the address first; the connected socket pins the peer. */
export const queryServerInfo = (
  address: string,
  port: number,
  timeoutMs = 900
): Promise<ServerInfo | null> =>
  new Promise((resolve) => {
    const socket = createSocket('udp4')
    let done = false,
      challenged = false,
      started = 0
    const finish = (result: ServerInfo | null): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        /* Socket may fail before bind. */
      }
      resolve(result)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    socket.on('error', () => finish(null))
    socket.on('message', (packet) => {
      if (
        packet.length === 9 &&
        packet.readInt32LE(0) === -1 &&
        packet[4] === 0x41 &&
        !challenged
      ) {
        challenged = true
        started = performance.now()
        socket.send(Buffer.concat([request, packet.subarray(5)]), (error) => {
          if (error) finish(null)
        })
        return
      }
      const info = parseServerInfo(packet)
      if (info) finish({ ...info, pingMs: Math.max(1, Math.round(performance.now() - started)) })
    })
    socket.connect(port, address, () => {
      if (done) return
      started = performance.now()
      socket.send(request, (error) => {
        if (error) finish(null)
      })
    })
  })
