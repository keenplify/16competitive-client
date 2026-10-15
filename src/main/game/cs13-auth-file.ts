import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { cs13ConnectionArgs } from './adapters/cs13'

type Connection = Parameters<typeof cs13ConnectionArgs>[0]
export function cs13AuthContents(connection: Connection): { name: string; contents: string } {
  cs13ConnectionArgs(connection)
  const wireToken = createHash('sha256')
    .update(`cs13:${connection.joinToken}`)
    .digest('hex')
    .slice(0, 32)
  const fileId = createHash('sha256')
    .update(`cs13file:${connection.password}`)
    .digest('hex')
    .slice(0, 16)
  return {
    name: `16c13_${fileId}.cfg`,
    contents: `// 1.3 Competitive session authentication\ncmd 16c13_auth ${wireToken}\n`
  }
}

/** The server requests this exact session file after saved userinfo has loaded. */
export async function createCs13AuthFile(
  gameDirectory: string,
  connection: Connection
): Promise<() => Promise<void>> {
  const { name, contents } = cs13AuthContents(connection)
  const path = join(gameDirectory, name)
  let created = false
  const readFlags = constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW)
  try {
    const file = await open(path, 'wx', 0o600)
    created = true
    try {
      await file.writeFile(contents, 'utf8')
    } finally {
      await file.close()
    }
  } catch (error) {
    if (created) {
      await rm(path, { force: true })
      throw error
    }
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'EEXIST'
    )
      throw error
    const file = await open(path, readFlags)
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > 512 || (await file.readFile('utf8')) !== contents)
        throw new Error('Unrecognized 1.3 session file')
    } finally {
      await file.close()
    }
  }
  return async () => {
    try {
      const file = await open(path, readFlags)
      try {
        const stat = await file.stat()
        if (!stat.isFile() || stat.size > 512 || (await file.readFile('utf8')) !== contents)
          throw new Error('Changed 1.3 session file preserved')
      } finally {
        await file.close()
      }
      await rm(path)
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
        return
      throw error
    }
  }
}
