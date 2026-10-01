import { randomUUID } from 'node:crypto'
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'

// GoldSrc can load config.cfg after command-line +exec and overwrite its userinfo.
// Stage only the launcher-owned join key before Steam starts the game.
export async function stageMatchJoinToken(configPath: string, token: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) throw new Error('Invalid match join token')
  const existing = await readFile(configPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return Buffer.alloc(0)
    throw error
  })
  if (existing.length > 1024 * 1024) throw new Error('Counter-Strike config is too large')
  const source = existing.toString('latin1')
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const withoutJoinKey = source.replace(
    /^[ \t]*(?:setinfo[ \t]+)?(?:"_16c"|_16c)[ \t]+(?:"[^"\r\n]*"|[^\s\r\n]+)[ \t]*(?:\r?\n|$)/gim,
    ''
  )
  const next = `${withoutJoinKey}${withoutJoinKey && !withoutJoinKey.endsWith('\n') ? newline : ''}setinfo "_16c" "${token}"${newline}`
  const mode = (await stat(configPath).catch(() => null))?.mode ?? 0o600
  const temporary = `${configPath}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, Buffer.from(next, 'latin1'), { mode })
    await rename(temporary, configPath)
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}
