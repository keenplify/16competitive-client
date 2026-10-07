import { randomUUID } from 'node:crypto'
import { lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BEGIN = Buffer.from('// 16competitive managed match handoff begin')
const END = Buffer.from('// 16competitive managed match handoff end')
const STALE_IDENTITY_LINE =
  /^[ \t]*setinfo[ \t]+(?:"_16c"|_16c)[ \t]+(?:"[^"\r\n]*"|[^ \t\r\n;]+)[ \t]*(?:\/\/[^\r\n]*)?\r?\n?$/i

const removeStaleIdentityLines = (contents: Buffer): Buffer => {
  const retained: Buffer[] = []
  let start = 0
  while (start < contents.length) {
    const newline = contents.indexOf(10, start)
    const end = newline < 0 ? contents.length : newline + 1
    const line = contents.subarray(start, end)
    if (!STALE_IDENTITY_LINE.test(line.toString('latin1'))) retained.push(line)
    start = end
  }
  return Buffer.concat(retained)
}

const removeManagedBlock = (contents: Buffer): Buffer => {
  let result = contents
  while (true) {
    const begin = result.indexOf(BEGIN)
    if (begin < 0) return result
    const endMarker = result.indexOf(END, begin + BEGIN.length)
    if (endMarker < 0) throw new Error('Incomplete 16competitive userconfig handoff')
    const start = begin
    let end = endMarker + END.length
    if (result[end] === 13) end++
    if (result[end] === 10) end++
    result = Buffer.concat([result.subarray(0, start), result.subarray(end)])
  }
}

const writeAtomically = async (path: string, contents: Buffer, mode: number): Promise<void> => {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, contents, { mode, flag: 'wx' })
    await rename(temporaryPath, path)
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
}

export interface MatchUserConfigHandoff {
  readonly diagnostics: {
    userConfigExisted: boolean
    staleManagedBlockFound: boolean
    staleIdentityLinesRemoved: number
  }
  restore(): Promise<'restored' | 'removed-created-file' | 'preserved-player-edits' | 'missing'>
}

/** Remove a handoff left by a launcher that exited before match cleanup ran. */
export const removeStaleMatchUserConfigHandoff = async (
  launchGameDirectory: string
): Promise<boolean> => {
  const path = join(launchGameDirectory, 'userconfig.cfg')
  const existing = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!existing) return false
  if (!existing.isFile()) throw new Error('userconfig.cfg is not a regular file')
  const original = await readFile(path)
  if (!original.includes(BEGIN)) return false
  const clean = removeManagedBlock(original)
  await writeAtomically(path, clean, existing.mode & 0o777)
  return true
}

export const prepareMatchUserConfigHandoff = async (
  launchGameDirectory: string,
  matchConfigName: string
): Promise<MatchUserConfigHandoff> => {
  if (!/^[A-Za-z0-9_.-]+\.cfg$/.test(matchConfigName)) {
    throw new Error('Invalid match config name')
  }
  const path = join(launchGameDirectory, 'userconfig.cfg')
  const existing = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (existing && !existing.isFile()) throw new Error('userconfig.cfg is not a regular file')
  const original = existing ? await readFile(path) : Buffer.alloc(0)
  const staleIdentityLinesRemoved = original
    .toString('latin1')
    .split('\n')
    .filter((line) => STALE_IDENTITY_LINE.test(line)).length
  const staleManagedBlockFound = original.includes(BEGIN)
  const clean = removeStaleIdentityLines(removeManagedBlock(original))
  const separator = clean.length > 0 && clean[clean.length - 1] !== 10 ? '\n' : ''
  const managedBlock = Buffer.from(
    `${separator}${BEGIN.toString()}\nexec "${matchConfigName}"\n${END.toString()}\n`
  )
  const installed = Buffer.concat([clean, managedBlock])
  const mode = existing ? existing.mode & 0o777 : 0o600
  await writeAtomically(path, installed, mode)

  type RestoreOutcome = Awaited<ReturnType<MatchUserConfigHandoff['restore']>>
  let restoration: Promise<RestoreOutcome> | null = null
  const restore = async (): Promise<RestoreOutcome> => {
    const currentStat = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (!currentStat) return 'missing'
    if (!currentStat.isFile()) throw new Error('userconfig.cfg changed to a non-file')
    const current = await readFile(path)
    if (current.equals(installed)) {
      if (existing) await writeAtomically(path, clean, mode)
      else await unlink(path)
      return existing ? 'restored' : 'removed-created-file'
    }
    const withoutHandoff = removeManagedBlock(current)
    if (!withoutHandoff.equals(current)) {
      await writeAtomically(path, withoutHandoff, currentStat.mode & 0o777)
    }
    return 'preserved-player-edits'
  }
  return {
    diagnostics: {
      userConfigExisted: existing !== null,
      staleManagedBlockFound,
      staleIdentityLinesRemoved
    },
    restore() {
      restoration ??= restore().catch((error: unknown) => {
        restoration = null
        throw error
      })
      return restoration
    }
  }
}
