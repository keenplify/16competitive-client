import { randomUUID } from 'node:crypto'
import { link, lstat, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Cs16Distribution } from './cs16-installation'

const CONTENTS = '// 16competitive temporary startup bridge v1\nstuffcmds\n'

export interface MatchStartupBridge {
  installed: boolean
  restore(): Promise<void>
}

/** Remove only our exact bridge; preserve player edits and non-regular files. */
export const removeStaleMatchStartupBridge = async (gameDirectory: string): Promise<boolean> => {
  const path = join(gameDirectory, 'valve.rc')
  const existing = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!existing?.isFile() || existing.size !== Buffer.byteLength(CONTENTS)) return false
  if ((await readFile(path, 'utf8')) !== CONTENTS) return false
  await unlink(path)
  return true
}

/** Some standalone builds omit valve.rc, so +exec is never processed. Create
 * only a temporary command-line bridge, never a replacement player profile.
 * Do not shadow existing loose scripts or packed game content. Steam and
 * NextClient retain their existing startup behavior.
 */
export const prepareMatchStartupBridge = async (
  gameDirectory: string,
  installation: { distribution: Cs16Distribution; nextClient: boolean }
): Promise<MatchStartupBridge> => {
  const inactive: MatchStartupBridge = {
    installed: false,
    restore: async (): Promise<void> => undefined
  }
  if (installation.distribution !== 'standalone' || installation.nextClient) return inactive
  const path = join(gameDirectory, 'valve.rc')
  const existing = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (existing) {
    if (
      !existing.isFile() ||
      existing.size !== Buffer.byteLength(CONTENTS) ||
      (await readFile(path, 'utf8')) !== CONTENTS
    ) {
      return inactive
    }
  } else {
    const directories = [gameDirectory, join(dirname(gameDirectory), 'valve')]
    for (const directory of directories) {
      const entries = await readdir(directory, { withFileTypes: true }).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return []
          throw error
        }
      )
      if (entries.some((entry) => /^valve\.rc$|^pak\d+\.pak$/i.test(entry.name))) return inactive
    }
    const temporaryPath = join(gameDirectory, `16competitive_startup.${randomUUID()}.tmp`)
    try {
      await writeFile(temporaryPath, CONTENTS, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      // Hard-link publication is atomic and fails if someone creates valve.rc.
      const published = await link(temporaryPath, path)
        .then(() => true)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'EEXIST') return false
          throw error
        })
      if (!published) return inactive
    } finally {
      await unlink(temporaryPath).catch(() => undefined)
    }
  }
  return {
    installed: true,
    async restore() {
      await removeStaleMatchStartupBridge(gameDirectory)
    }
  }
}
