import { lstat, open } from 'node:fs/promises'
import { constants } from 'node:fs'

export type NativeScore = { id: number; kills: number; deaths: number; ping: number; name: string }
export function parseNativeScores(text: string): NativeScore[] | null {
  if (Buffer.byteLength(text) > 4096 || !text.endsWith('\n')) return null
  const lines = text.slice(0, -1).split('\n')
  if (lines.shift() !== '#16c-native-scoreboard-v1' || lines.length > 32) return null
  const rows: NativeScore[] = []
  const seen = new Set<number>()
  for (const line of lines) {
    const fields = line.split('\t')
    if (
      fields.length !== 5 ||
      !/^[1-9]\d?$/.test(fields[0]) ||
      !/^-?\d+$/.test(fields[1]) ||
      !/^\d+$/.test(fields[2]) ||
      !/^\d+$/.test(fields[3])
    )
      return null
    const [id, kills, deaths, ping] = fields.slice(0, 4).map(Number)
    const name = fields[4]
    if (
      id > 32 ||
      kills < -32768 ||
      kills > 32767 ||
      deaths > 32767 ||
      ping > 32767 ||
      seen.has(id) ||
      !name ||
      Buffer.byteLength(name) > 63 ||
      Array.from(name).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      )
    )
      return null
    seen.add(id)
    rows.push({ id, kills, deaths, ping, name })
  }
  return rows
}

export async function readNativeScores(path: string): Promise<NativeScore[] | null> {
  try {
    const link = await lstat(path)
    if (!link.isFile() || link.size > 4096) return null
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const info = await handle.stat()
      if (!info.isFile() || info.size > 4096 || Date.now() - info.mtimeMs > 1500) return null
      const bytes = Buffer.alloc(4097)
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
      if (bytesRead !== info.size) return null
      return parseNativeScores(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead))
      )
    } finally {
      await handle.close()
    }
  } catch {
    return null
  }
}

export function mergeNativeScores<
  T extends { players: { id: number; name: string; kills: number; deaths: number; ping: number }[] }
>(snapshot: T, native: NativeScore[]): T {
  return {
    ...snapshot,
    players: snapshot.players.map((player) => {
      const local = native.find((row) => row.id === player.id && row.name === player.name)
      return local
        ? { ...player, kills: local.kills, deaths: local.deaths, ping: local.ping }
        : player
    })
  }
}
