import { open, readFile, rm, stat, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { getOwnedSkins } from '../skins'
import { getSavedCs16Executable } from './game-settings'
import {
  ensureCompetitiveGameDirectory,
  getCompetitiveGameDirectory
} from './competitive-game-directory'

const STOCK_ACTION_SOUNDS: Record<string, readonly string[]> = {
  p228: ['p228-1.wav'],
  glock18: ['glock18-1.wav', 'glock18-2.wav'],
  usp: ['usp1.wav', 'usp2.wav', 'usp_unsil-1.wav'],
  deagle: ['deagle-1.wav', 'deagle-2.wav'],
  elite: ['elite_fire.wav'],
  fiveseven: ['fiveseven-1.wav'],
  m3: ['m3-1.wav'],
  xm1014: ['xm1014-1.wav'],
  mac10: ['mac10-1.wav'],
  tmp: ['tmp-1.wav'],
  mp5navy: ['mp5-1.wav'],
  ump45: ['ump45-1.wav'],
  p90: ['p90-1.wav'],
  galil: ['galil-1.wav', 'galil-2.wav'],
  famas: ['famas-1.wav', 'famas-2.wav', 'famas-burst.wav'],
  ak47: ['ak47-1.wav', 'ak47-2.wav'],
  m4a1: ['m4a1-1.wav', 'm4a1_unsil-1.wav', 'm4a1_unsil-2.wav'],
  scout: ['scout_fire-1.wav'],
  sg552: ['sg552-1.wav', 'sg552-2.wav'],
  aug: ['aug-1.wav'],
  awp: ['awp1.wav'],
  g3sg1: ['g3sg1-1.wav'],
  sg550: ['sg550-1.wav'],
  m249: ['m249-1.wav', 'm249-2.wav'],
  knife: ['knife_slash1.wav', 'knife_slash2.wav', 'knife_stab.wav'],
  hegrenade: [
    'explode3.wav',
    'explode4.wav',
    'explode5.wav',
    'debris1.wav',
    'debris2.wav',
    'debris3.wav'
  ],
  flashbang: ['flashbang-1.wav', 'flashbang-2.wav'],
  smokegrenade: ['sg_explode.wav']
}

let activeMatchId: string | null = null
let activeGameDirectory: string | null = null
let connectionGuardTimer: ReturnType<typeof setInterval> | null = null
let connectionGuardGeneration = 0
let managedConnectionTargets = new Set<string>()

const normalizeConnectionTarget = (value: string): string =>
  value.trim().replace(/\.{3}$/, '').replace(/\.$/, '').toLowerCase()

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

const isWave = (bytes: Buffer): boolean =>
  bytes.length >= 12 &&
  bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
  bytes.subarray(8, 12).toString('ascii') === 'WAVE'

const safeGamePath = (root: string, ...parts: string[]): string => {
  const destination = resolve(root, ...parts)
  if (relative(resolve(root), destination).startsWith('..')) {
    throw new Error('Managed 1.6 Competitive path escaped its game directory.')
  }
  return destination
}

const makeSilentWav = (): Buffer => {
  const sampleRate = 11_025
  const sampleCount = Math.ceil(sampleRate * 0.05)
  const data = Buffer.alloc(sampleCount, 128)
  const output = Buffer.alloc(44 + data.length)
  output.write('RIFF', 0, 'ascii')
  output.writeUInt32LE(36 + data.length, 4)
  output.write('WAVE', 8, 'ascii')
  output.write('fmt ', 12, 'ascii')
  output.writeUInt32LE(16, 16)
  output.writeUInt16LE(1, 20)
  output.writeUInt16LE(1, 22)
  output.writeUInt32LE(sampleRate, 24)
  output.writeUInt32LE(sampleRate, 28)
  output.writeUInt16LE(1, 32)
  output.writeUInt16LE(8, 34)
  output.write('data', 36, 'ascii')
  output.writeUInt32LE(data.length, 40)
  data.copy(output, 44)
  return output
}

const readPakEntry = async (
  pakPath: string,
  entryName: string
): Promise<Buffer | null> => {
  const handle = await open(pakPath, 'r').catch(() => null)
  if (!handle) return null

  try {
    const header = Buffer.alloc(12)
    const headerRead = await handle.read(header, 0, header.length, 0)
    if (
      headerRead.bytesRead !== header.length ||
      header.subarray(0, 4).toString('ascii') !== 'PACK'
    ) {
      return null
    }

    const directoryOffset = header.readUInt32LE(4)
    const directoryLength = header.readUInt32LE(8)
    if (
      directoryLength === 0 ||
      directoryLength % 64 !== 0 ||
      directoryLength > 16 * 1024 * 1024
    ) {
      return null
    }

    const directory = Buffer.alloc(directoryLength)
    const directoryRead = await handle.read(
      directory,
      0,
      directory.length,
      directoryOffset
    )
    if (directoryRead.bytesRead !== directory.length) return null

    const target = entryName.replaceAll('\\', '/').toLowerCase()
    for (let offset = 0; offset < directory.length; offset += 64) {
      const nameBytes = directory.subarray(offset, offset + 56)
      const terminator = nameBytes.indexOf(0)
      const name = nameBytes
        .subarray(0, terminator >= 0 ? terminator : nameBytes.length)
        .toString('ascii')
        .replaceAll('\\', '/')
        .toLowerCase()
      if (name !== target) continue

      const dataOffset = directory.readUInt32LE(offset + 56)
      const dataLength = directory.readUInt32LE(offset + 60)
      if (dataLength < 12 || dataLength > 5 * 1024 * 1024) return null

      const bytes = Buffer.alloc(dataLength)
      const read = await handle.read(bytes, 0, bytes.length, dataOffset)
      return read.bytesRead === bytes.length ? bytes : null
    }

    return null
  } finally {
    await handle.close()
  }
}

const readVanillaStockSound = async (
  gameDirectory: string,
  fileName: string
): Promise<Buffer | null> => {
  for (const base of ['cstrike', 'valve']) {
    const bytes = await readFile(
      join(gameDirectory, base, 'sound', 'weapons', fileName)
    ).catch(() => null)
    if (bytes && isWave(bytes)) return bytes
  }

  const entryName = `sound/weapons/${fileName}`
  for (const base of ['cstrike', 'valve']) {
    for (let index = 0; index <= 9; index += 1) {
      const bytes = await readPakEntry(
        join(gameDirectory, base, `pak${index}.pak`),
        entryName
      )
      if (bytes && isWave(bytes)) return bytes
    }
  }

  return null
}

export const stopManagedSkinAudioConnectionGuard = (): void => {
  connectionGuardGeneration += 1
  if (connectionGuardTimer) clearInterval(connectionGuardTimer)
  connectionGuardTimer = null
  managedConnectionTargets = new Set<string>()
}

export const restoreManagedSkinAudio = async (): Promise<void> => {
  stopManagedSkinAudioConnectionGuard()
  const root = activeGameDirectory
  activeMatchId = null
  activeGameDirectory = null
  if (!root) return

  const competitiveDirectory = getCompetitiveGameDirectory(root)
  await rm(join(competitiveDirectory, 'sound', 'weapons'), {
    recursive: true,
    force: true
  }).catch(() => undefined)

  console.info('[SkinAudio] removed 1.6 Competitive sound overrides', {
    competitiveDirectory
  })
}

export const restoreStaleManagedSkinAudio = async (): Promise<void> => {
  // New builds never mutate cstrike. On startup, remove only stale overrides
  // from the dedicated 16competitive overlay left by an interrupted session.
  const executable = await getSavedCs16Executable().catch(() => null)
  if (!executable) return
  const root = dirname(resolve(executable))
  const competitiveDirectory = getCompetitiveGameDirectory(root)
  await rm(join(competitiveDirectory, 'sound', 'weapons'), {
    recursive: true,
    force: true
  }).catch(() => undefined)
}

export const prepareManagedSkinAudio = async (
  matchId: string,
  gameDirectory: string
): Promise<void> => {
  if (activeMatchId === matchId && activeGameDirectory === gameDirectory) return

  await restoreManagedSkinAudio()
  const competitiveDirectory = await ensureCompetitiveGameDirectory(gameDirectory)
  const owned = await getOwnedSkins()
  const now = Date.now()
  const audioSkins = owned.filter(({ skin, equippedAt }) => {
    if (equippedAt === null) return false
    if (skin.status !== 'ACTIVE' && skin.status !== 'UNLISTED') return false
    if (
      skin.status === 'ACTIVE' &&
      ((skin.availableFrom !== null && new Date(skin.availableFrom).getTime() > now) ||
        (skin.availableUntil !== null && new Date(skin.availableUntil).getTime() <= now))
    ) {
      return false
    }
    return (
      typeof skin.actionSoundPath === 'string' &&
      skin.actionSoundPath.length > 0 &&
      Boolean(STOCK_ACTION_SOUNDS[skin.weaponKey]?.length)
    )
  })

  for (const { skin } of audioSkins) {
    if (
      !skin.actionSoundPath ||
      !/^sound\/16competitive\/[a-z0-9_/-]+\.wav$/i.test(skin.actionSoundPath) ||
      skin.actionSoundPath.includes('..')
    ) {
      throw new Error(`Custom audio path is invalid for ${skin.name}.`)
    }
    const customSound = safeGamePath(competitiveDirectory, skin.actionSoundPath)
    const bytes = await readFile(customSound).catch(() => null)
    if (!bytes || !isWave(bytes)) {
      throw new Error(
        `Custom audio for ${skin.name} is missing or invalid. Retry the match asset download before launching.`
      )
    }
  }

  const weaponKeys = [...new Set(audioSkins.map(({ skin }) => skin.weaponKey))]
  if (weaponKeys.length === 0) {
    activeMatchId = matchId
    activeGameDirectory = gameDirectory
    return
  }

  const files = [
    ...new Set(weaponKeys.flatMap((weaponKey) => STOCK_ACTION_SOUNDS[weaponKey] ?? []))
  ]
  const silent = makeSilentWav()

  for (const fileName of files) {
    const vanillaBytes = await readVanillaStockSound(gameDirectory, fileName)
    if (!vanillaBytes) {
      throw new Error(
        `Cannot enable custom skin audio because the original Counter-Strike sound ${fileName} could not be found as a loose WAV. Verify or repair your game files.`
      )
    }

    const defaultCopy = safeGamePath(
      competitiveDirectory,
      'sound',
      '16competitive',
      'default',
      fileName
    )
    await mkdir(join(competitiveDirectory, 'sound', '16competitive', 'default'), {
      recursive: true,
      mode: 0o700
    })
    await writeFile(defaultCopy, vanillaBytes, { mode: 0o600 })

    const override = safeGamePath(
      competitiveDirectory,
      'sound',
      'weapons',
      fileName
    )
    await mkdir(join(competitiveDirectory, 'sound', 'weapons'), {
      recursive: true,
      mode: 0o700
    })
    await writeFile(override, silent, { mode: 0o600 })
  }

  activeMatchId = matchId
  activeGameDirectory = gameDirectory
  console.info('[SkinAudio] enabled isolated owner-only audio overrides', {
    matchId,
    competitiveDirectory,
    weaponKeys,
    mutedFiles: files.length
  })
}

export const startManagedSkinAudioConnectionGuard = async (
  matchId: string,
  gameDirectory: string
): Promise<void> => {
  stopManagedSkinAudioConnectionGuard()
  if (activeMatchId !== matchId) return

  const generation = ++connectionGuardGeneration
  const competitiveDirectory = getCompetitiveGameDirectory(gameDirectory)
  const candidates = [
    join(gameDirectory, 'qconsole.log'),
    join(competitiveDirectory, 'qconsole.log')
  ]
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

        console.warn(
          '[SkinAudio] managed GoldSrc process is leaving 1.6 Competitive; removing overrides',
          {
            matchId,
            managedTargets: [...managedConnectionTargets],
            nextTarget: event.target
          }
        )
        await restoreManagedSkinAudio().catch((error: unknown) => {
          console.error('[SkinAudio] external-server cleanup failed', error)
        })
        return
      }
    }
  }

  connectionGuardTimer = setInterval(() => void poll(), 500)
  connectionGuardTimer.unref?.()
}
