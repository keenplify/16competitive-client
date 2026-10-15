import { constants } from 'node:fs'
import { copyFile, link, lstat, mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { extname, join } from 'node:path'
import type { LegacyInstallation } from '../../shared/legacy-game'
import { cs13Adapter, hasCs13VersionMetadata } from './adapters/cs13'

const assetExtensions = new Set([
  '.mdl',
  '.bsp',
  '.wad',
  '.spr',
  '.wav',
  '.mp3',
  '.tga',
  '.bmp',
  '.pcx',
  '.txt',
  '.res',
  '.lst',
  '.sc',
  '.pak',
  '.avi'
])

/** WON switches to the server's game directory during signon. Populate that
 * directory before starting, using local assets and preserving existing files.
 * Player configuration and launcher/helper session files are never copied. */
export async function prepareCs13MatchInstallation(
  installation: LegacyInstallation,
  platform: NodeJS.Platform
): Promise<LegacyInstallation> {
  if (installation.modDirectory === 'cstrk13') return installation
  const destination = join(installation.folderPath, 'cstrk13')
  const ensureDirectory = async (path: string): Promise<void> => {
    await mkdir(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    })
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Unsafe Legacy 1.3 asset directory')
  }
  await ensureDirectory(destination)
  const existingMetadata = await lstat(join(destination, 'liblist.gam')).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return null
    }
  )
  if (
    existingMetadata &&
    (!existingMetadata.isFile() ||
      existingMetadata.isSymbolicLink() ||
      existingMetadata.size > 16384 ||
      !hasCs13VersionMetadata(await readFile(join(destination, 'liblist.gam'), 'utf8')))
  )
    throw new Error('Existing cstrk13 directory is not a compatible Legacy 1.3 installation')

  let files = 0
  let bytes = 0
  const copyMissing = async (source: string, target: string): Promise<void> => {
    const info = await lstat(source)
    if (!info.isFile() || info.isSymbolicLink()) return
    files += 1
    bytes += info.size
    if (files > 30000 || bytes > 4 * 1024 ** 3)
      throw new Error('Legacy 1.3 assets exceed copy limits')
    const existing = await lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return null
    })
    if (existing) {
      if (!existing.isFile() || existing.isSymbolicLink())
        throw new Error('Unsafe Legacy 1.3 asset')
      return
    }
    const temporary = `${target}.${randomUUID()}.16c-tmp`
    try {
      await copyFile(source, temporary, constants.COPYFILE_EXCL)
      // Publish the complete file without overwriting a concurrent/user write.
      await link(temporary, target).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error
      })
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
  }
  const walk = async (source: string, target: string, depth: number): Promise<void> => {
    if (depth > 12) throw new Error('Legacy 1.3 asset directory is too deep')
    for (const entry of await readdir(source, { withFileTypes: true })) {
      // Filter names before metadata access; config.cfg is strictly out of bounds.
      if (entry.name.toLowerCase() === 'config.cfg' || entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        await ensureDirectory(join(target, entry.name))
        await walk(join(source, entry.name), join(target, entry.name), depth + 1)
      } else if (assetExtensions.has(extname(entry.name).toLowerCase())) {
        await copyMissing(join(source, entry.name), join(target, entry.name))
      }
    }
  }
  for (const directory of [
    'models',
    'maps',
    'sprites',
    'sound',
    'gfx',
    'resource',
    'events',
    'media',
    'overviews'
  ]) {
    const source = join(installation.gameDirectory, directory)
    const info = await lstat(source).catch(() => null)
    if (!info?.isDirectory() || info.isSymbolicLink()) continue
    await ensureDirectory(join(destination, directory))
    await walk(source, join(destination, directory), 0)
  }
  for (const entry of await readdir(installation.gameDirectory, { withFileTypes: true })) {
    if (entry.name.toLowerCase() === 'config.cfg' || !entry.isFile()) continue
    if (assetExtensions.has(extname(entry.name).toLowerCase()) && entry.name !== 'qconsole.log')
      await copyMissing(join(installation.gameDirectory, entry.name), join(destination, entry.name))
  }
  await ensureDirectory(join(destination, 'cl_dlls'))
  const client =
    installation.runtime === 'native' && platform === 'linux' ? 'client.so' : 'client.dll'
  await copyMissing(
    join(installation.gameDirectory, 'cl_dlls', client),
    join(destination, 'cl_dlls', client)
  )
  // Publish version evidence last, after the assets and stock client are ready.
  await copyMissing(
    join(installation.gameDirectory, 'liblist.gam'),
    join(destination, 'liblist.gam')
  )
  return cs13Adapter.validateInstallation(destination, platform)
}
