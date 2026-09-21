import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { getLauncherContentDirectory } from './game-directory'

/**
 * Custom weapon action sounds are switched off.
 *
 * They used to work by writing silent/custom WAVs over the stock ones inside a
 * launcher-owned overlay game directory, and by deleting that overlay again on
 * cleanup. Every installation now runs on the real `cstrike` directory - the
 * match servers require it and the Steam-backed filesystem only searches it (see
 * `game-directory.ts`) - so the same writes would overwrite the player's own
 * sound files and cleanup would delete them. The feature is disabled rather than
 * risk damaging an installation.
 *
 * What remains here is the connection guard: it watches the engine log for the
 * managed GoldSrc process connecting somewhere other than the assigned match
 * server.
 */

let activeMatchId: string | null = null
let connectionGuardTimer: ReturnType<typeof setInterval> | null = null
let connectionGuardGeneration = 0
let managedConnectionTargets = new Set<string>()

const normalizeConnectionTarget = (value: string): string =>
  value
    .trim()
    .replace(/\.{3}$/, '')
    .replace(/\.$/, '')
    .toLowerCase()

interface ConnectionLogEvent {
  type: 'connecting' | 'accepted'
  target: string
}

const connectionEventsFromLog = (value: string): ConnectionLogEvent[] =>
  value
    .split(/\r?\n/)
    .flatMap((line): ConnectionLogEvent[] => {
      const accepted = line.match(/\bConnection accepted by\s+([^\s]+)\s*$/i)?.[1]
      if (accepted) return [{ type: 'accepted', target: normalizeConnectionTarget(accepted) }]
      const connecting = line.match(/\bConnecting to\s+([^\s]+?)(?:\.{3})?\s*$/i)?.[1]
      return connecting
        ? [{ type: 'connecting', target: normalizeConnectionTarget(connecting) }]
        : []
    })
    .filter((event) => Boolean(event.target))

export const stopManagedSkinAudioConnectionGuard = (): void => {
  connectionGuardGeneration += 1
  if (connectionGuardTimer) clearInterval(connectionGuardTimer)
  connectionGuardTimer = null
  managedConnectionTargets = new Set<string>()
}

/**
 * Ends the managed match session. Nothing is written into the game directory, so
 * there is nothing to undo - in particular this must never delete anything from
 * the player's `cstrike` folder.
 */
export const restoreManagedSkinAudio = async (): Promise<void> => {
  stopManagedSkinAudioConnectionGuard()
  activeMatchId = null
}

/**
 * Startup cleanup hook. There is no launcher-owned overlay left to remove, so
 * this is intentionally inert.
 */
export const restoreStaleManagedSkinAudio = async (): Promise<void> => undefined

export const prepareManagedSkinAudio = async (matchId: string): Promise<void> => {
  activeMatchId = matchId
}

export const startManagedSkinAudioConnectionGuard = async (
  matchId: string,
  gameDirectory: string
): Promise<void> => {
  stopManagedSkinAudioConnectionGuard()
  if (activeMatchId !== matchId) return

  const generation = ++connectionGuardGeneration
  const contentDirectory = getLauncherContentDirectory(gameDirectory)
  const candidates = [join(gameDirectory, 'qconsole.log'), join(contentDirectory, 'qconsole.log')]
  const offsets = new Map<string, number>()
  for (const path of candidates) {
    offsets.set(path, (await stat(path).catch(() => null))?.size ?? 0)
  }

  const poll = async (): Promise<void> => {
    if (generation !== connectionGuardGeneration || activeMatchId !== matchId) return

    for (const path of candidates) {
      const metadata = await stat(path).catch(() => null)
      if (!metadata?.isFile()) continue
      const previousOffset = offsets.get(path) ?? 0
      const currentOffset = metadata.size < previousOffset ? 0 : previousOffset
      if (metadata.size <= currentOffset) continue

      const bytes = await readFile(path).catch(() => null)
      if (!bytes) continue
      offsets.set(path, bytes.length)

      const chunk = bytes.subarray(currentOffset).toString('utf8')
      for (const event of connectionEventsFromLog(chunk)) {
        if (managedConnectionTargets.size === 0) {
          managedConnectionTargets.add(event.target)
          continue
        }
        if (event.type === 'accepted') {
          managedConnectionTargets.add(event.target)
          continue
        }
        if (managedConnectionTargets.has(event.target)) continue

        console.warn('[MatchSession] managed GoldSrc process is leaving 1.6 Competitive', {
          matchId,
          managedTargets: [...managedConnectionTargets],
          nextTarget: event.target
        })
        await restoreManagedSkinAudio().catch((error: unknown) => {
          console.error('[MatchSession] external-server cleanup failed', error)
        })
        return
      }
    }
  }

  connectionGuardTimer = setInterval(() => void poll(), 500)
  connectionGuardTimer.unref?.()
}
