import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  symlink
} from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const metadata = (path: string): ReturnType<typeof lstat> => lstat(path)
const missing = async (path: string): Promise<boolean> => {
  try {
    await metadata(path)
    return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
}

/** Creates directories without following unexpected links beneath an approved root. */
async function directory(root: string, segments: string[]): Promise<string> {
  let current = root
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..' || /[/\\\0]/.test(segment))
      throw new Error('Unsafe managed asset directory')
    current = join(current, segment)
    await mkdir(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    })
    const info = await metadata(current)
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error(`Unexpected link or file in managed assets: ${current}`)
  }
  return current
}

async function modelFiles(root: string, prefix = ''): Promise<string[]> {
  const result: string[] = []
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) result.push(...(await modelFiles(root, path)))
    else if (entry.isFile() && /^[A-Za-z0-9_-]+\.mdl$/.test(entry.name)) result.push(path)
    else throw new Error(`Unexpected entry in managed model folder: ${path}`)
  }
  return result
}

/** Only this exact launcher-owned namespace may link outside the installation.
 * Existing directories are merged after conflict checks, then retained as a
 * migration backup. Unknown files/links/conflicting bytes are never overwritten.
 */
export async function ensureSharedModelDirectory(
  contentDirectory: string,
  sharedDirectory: string
): Promise<void> {
  const content = await realpath(contentDirectory)
  await mkdir(sharedDirectory, { recursive: true })
  const sharedInfo = await metadata(sharedDirectory)
  if (!sharedInfo.isDirectory() || sharedInfo.isSymbolicLink())
    throw new Error('Shared model storage must be an ordinary directory')
  const shared = await realpath(sharedDirectory)
  const models = await directory(content, ['models'])
  const link = join(models, '16competitive')
  if (!(await missing(link))) {
    const info = await metadata(link)
    if (info.isSymbolicLink()) {
      if ((await realpath(link)) !== shared)
        throw new Error('Managed models link has an unexpected target')
      return
    }
    if (!info.isDirectory()) throw new Error('Managed models path is not a directory')
    const files = await modelFiles(link)
    // Check the entire merge before migrating any source directory.
    for (const file of files) {
      const destination = await managedAssetDestination(shared, file)
      if (!(await missing(destination))) {
        const hash = async (path: string): Promise<string> =>
          createHash('sha256')
            .update(await readFile(path))
            .digest('hex')
        if ((await hash(join(link, file))) !== (await hash(destination)))
          throw new Error(`Conflicting managed model: ${file}`)
      }
    }
    for (const file of files) {
      const destination = await managedAssetDestination(shared, file)
      if (await missing(destination))
        await copyFile(join(link, file), destination, constants.COPYFILE_EXCL)
    }
    const backup = `${link}.before-shared-${randomUUID()}`
    await rename(link, backup)
    try {
      await symlink(shared, link, process.platform === 'win32' ? 'junction' : 'dir')
    } catch (error) {
      await rename(backup, link)
      throw error
    }
    console.info('[SkinAssets] migrated managed model directory', { link, shared, backup })
    return
  }
  await symlink(shared, link, process.platform === 'win32' ? 'junction' : 'dir')
}

/** The writer addresses physical shared storage, never traverses the game link.
 * Rejects every other directory/file symlink, including nested model links.
 */
export async function managedAssetDestination(root: string, assetPath: string): Promise<string> {
  if (isAbsolute(assetPath) || assetPath.includes('\\') || assetPath.includes('\0'))
    throw new Error('Unsafe managed asset path')
  const destination = resolve(root, assetPath)
  const suffix = relative(root, destination)
  if (!suffix || suffix === '..' || suffix.startsWith(`..${sep}`))
    throw new Error('Managed asset escapes approved storage')
  const parts = assetPath.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..'))
    throw new Error('Unsafe managed asset path')
  await directory(root, parts.slice(0, -1))
  if (!(await missing(destination))) {
    const info = await metadata(destination)
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('Unexpected managed asset link or file')
  }
  return join(dirname(destination), parts.at(-1)!)
}
