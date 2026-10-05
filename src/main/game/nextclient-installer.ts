import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdtemp, open, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { shell } from 'electron'
import yauzl, { type Entry, type ZipFile } from 'yauzl'
import type { NextClientInstallProgress } from '../../shared/game-settings'
import { isNextClientInstallation } from './windows-cosmetic-compatibility'
import {
  nextClientArchiveUrl,
  nextClientInstallerName,
  nextClientRegistryKeys,
  nextClientRegistryValue
} from './nextclient-installer-source'

const execFileAsync = promisify(execFile)
const SITE_URL = 'https://nextclient.ru/'
const MAX_ARCHIVE_BYTES = 400 * 1024 * 1024
const MAX_INSTALLER_BYTES = 400 * 1024 * 1024
let installing = false
let activeDownload: AbortController | null = null

type Progress = (progress: NextClientInstallProgress) => void

async function downloadArchive(
  path: string,
  progress: Progress,
  signal: AbortSignal
): Promise<void> {
  progress({ phase: 'checking_source', downloadedBytes: 0, totalBytes: null })
  const page = await fetch(SITE_URL, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)])
  })
  if (!page.ok || new URL(page.url).hostname !== 'nextclient.ru') {
    throw new Error('Could not load the NextClient download page.')
  }
  const pageLength = Number(page.headers.get('content-length') ?? 0)
  if (pageLength > 1_000_000) throw new Error('NextClient download page was unexpectedly large.')
  const archiveUrl = nextClientArchiveUrl(await page.text())
  const response = await fetch(archiveUrl, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10 * 60_000)])
  })
  if (
    !response.ok ||
    !response.body ||
    new URL(response.url).protocol !== 'https:' ||
    new URL(response.url).hostname !== 'dl.skachat-cs.su'
  ) {
    throw new Error('Could not download the NextClient installer.')
  }
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_ARCHIVE_BYTES) throw new Error('NextClient download is unexpectedly large.')
  const totalBytes = length > 0 ? length : null
  const file = await open(path, 'wx')
  let downloadedBytes = 0
  let lastUpdate = 0
  try {
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk)
      downloadedBytes += bytes.length
      if (downloadedBytes > MAX_ARCHIVE_BYTES) {
        throw new Error('NextClient download exceeded the allowed size.')
      }
      let offset = 0
      while (offset < bytes.length) {
        const result = await file.write(bytes, offset, bytes.length - offset, null)
        offset += result.bytesWritten
      }
      if (Date.now() - lastUpdate > 150) {
        progress({ phase: 'downloading', downloadedBytes, totalBytes })
        lastUpdate = Date.now()
      }
    }
  } finally {
    await file.close()
  }
  if (totalBytes !== null && downloadedBytes !== totalBytes) {
    throw new Error('NextClient download was incomplete.')
  }
  progress({ phase: 'extracting', downloadedBytes, totalBytes })
}

async function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error('Could not open NextClient archive.'))
      else resolve(zip)
    })
  })
}

async function singleInstallerEntry(zip: ZipFile): Promise<Entry> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = []
    zip.on('error', reject)
    zip.on('entry', (entry: Entry) => {
      entries.push(entry)
      if (entries.length > 1) {
        reject(new Error('NextClient archive contains unexpected files.'))
        return
      }
      zip.readEntry()
    })
    zip.on('end', () => {
      const entry = entries[0]
      if (!entry) {
        reject(new Error('NextClient archive is empty.'))
        return
      }
      try {
        nextClientInstallerName(entry.fileName)
        if (
          entry.uncompressedSize > MAX_INSTALLER_BYTES ||
          entry.compressedSize > MAX_ARCHIVE_BYTES ||
          (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
        ) {
          throw new Error('NextClient installer has an unsupported archive format.')
        }
        resolve(entry)
      } catch (error) {
        reject(error)
      }
    })
    zip.readEntry()
  })
}

async function extractInstaller(archivePath: string, directory: string): Promise<string> {
  const zip = await openZip(archivePath)
  try {
    const entry = await singleInstallerEntry(zip)
    const installerPath = join(directory, nextClientInstallerName(entry.fileName))
    const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
      zip.openReadStream(entry, (error, input) => {
        if (error || !input) reject(error ?? new Error('Could not extract NextClient installer.'))
        else resolve(input)
      })
    })
    await pipeline(stream, createWriteStream(installerPath, { flags: 'wx' }))
    if ((await stat(installerPath)).size !== entry.uncompressedSize) {
      throw new Error('NextClient installer extraction was incomplete.')
    }
    const file = await open(installerPath, 'r')
    try {
      const header = Buffer.alloc(2)
      await file.read(header, 0, 2, 0)
      if (header.toString('ascii') !== 'MZ') {
        throw new Error('NextClient archive did not contain a Windows installer.')
      }
    } finally {
      await file.close()
    }
    return installerPath
  } finally {
    zip.close()
  }
}

export async function launchNextClientInstaller(progress: Progress): Promise<void> {
  if (process.platform !== 'win32') throw new Error('NextClient setup requires Windows.')
  if (installing) throw new Error('NextClient installation is already starting.')
  installing = true
  const controller = new AbortController()
  activeDownload = controller
  let directory: string | null = null
  try {
    directory = await mkdtemp(join(tmpdir(), '16competitive-nextclient-'))
    const archivePath = join(directory, 'NextClient.zip')
    await downloadArchive(archivePath, progress, controller.signal)
    controller.signal.throwIfAborted()
    const installerPath = await extractInstaller(archivePath, directory)
    await rm(archivePath, { force: true })
    controller.signal.throwIfAborted()
    progress({ phase: 'launching', downloadedBytes: 0, totalBytes: null })
    const error = await shell.openPath(installerPath)
    if (error) throw new Error(`Could not open the NextClient installer: ${error}`)
    // The installer remains in the OS temp directory until Windows clears it.
  } catch (error) {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    throw error
  } finally {
    activeDownload = null
    installing = false
  }
}

export function cancelNextClientInstaller(): void {
  activeDownload?.abort()
}

const uninstallRoots = [
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
]

async function registryOutput(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('reg.exe', args, {
      windowsHide: true,
      timeout: 5_000,
      maxBuffer: 4 * 1024 * 1024
    })
    return stdout
  } catch {
    return ''
  }
}

async function registryFolders(): Promise<string[]> {
  const folders: string[] = []
  for (const root of uninstallRoots) {
    const matches = nextClientRegistryKeys(
      await registryOutput(['query', root, '/s', '/v', 'DisplayName'])
    )
    for (const key of matches) {
      const location = nextClientRegistryValue(
        await registryOutput(['query', key, '/v', 'InstallLocation']),
        'InstallLocation'
      )
      if (location) folders.push(location.replace(/^"|"$/g, ''))
      const uninstall = nextClientRegistryValue(
        await registryOutput(['query', key, '/v', 'UninstallString']),
        'UninstallString'
      )
      if (uninstall) {
        const executable = /^"([^"]+\.exe)"/i.exec(uninstall)?.[1]
        if (executable) folders.push(dirname(executable))
      }
    }
  }
  return folders
}

async function likelyFolders(): Promise<string[]> {
  const roots = [
    join(process.env.SystemDrive ?? 'C:', 'Games'),
    process.env.ProgramFiles ?? '',
    process.env['PROGRAMFILES(X86)'] ?? '',
    process.env.LOCALAPPDATA ?? ''
  ].filter(isAbsolute)
  const folders: string[] = []
  for (const root of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries.slice(0, 128)) {
      if (entry.isDirectory() && /nextclient/i.test(entry.name))
        folders.push(join(root, entry.name))
    }
  }
  return folders
}

export async function detectNextClientFolder(): Promise<string | null> {
  if (process.platform !== 'win32') return null
  const folders = [...(await registryFolders()), ...(await likelyFolders())]
  for (const candidate of folders) {
    const folder = normalize(
      basename(candidate).toLowerCase() === 'cstrike' ? dirname(candidate) : candidate
    )
    if (!isAbsolute(folder)) continue
    if (!(await stat(join(folder, 'cstrike.exe')).catch(() => null))?.isFile()) continue
    if (await isNextClientInstallation(folder)) return folder
  }
  return null
}
