import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import releaseConfig from '../../../helper-release.json'
import { verifyPackagedHelper } from '../anticheat/helper-integrity'
import {
  verifyCosmeticModule,
  verifyHelperRelease,
  verifyNextClientModule
} from '../anticheat/helper-release-verifier'
import { isNextClientInstallation } from './windows-cosmetic-compatibility'
import {
  armWindowsIntegrationRecovery,
  restoreWindowsIntegration
} from './windows-integration-recovery'

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const missingOnly = (error: unknown): null => {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
  throw error
}

interface Journal {
  originalMiniSha256: string
  customMiniSha256: string
  cosmeticSha256: string
  ownsCosmetic: boolean
}

/** Transactional, match-scoped installation of the signed NextClient host pair. */
export class WindowsNextClientInstallation {
  private static pendingRestore: Promise<void> = Promise.resolve()
  readonly sessionDirectory: string
  private readonly managedPath: string
  private readonly miniPath: string
  private readonly originalMiniPath: string
  private readonly cosmeticPath: string
  private readonly journalPath: string

  private constructor(private readonly gameRoot: string) {
    const managed = join(gameRoot, '16competitive')
    this.managedPath = managed
    this.miniPath = join(gameRoot, 'cstrike', 'cl_dlls', 'client_mini.dll')
    this.originalMiniPath = join(managed, 'nextclient-client-mini.original.dll')
    this.cosmeticPath = join(gameRoot, 'papamo_cosmetic_module.dll')
    this.journalPath = join(managed, 'nextclient-install.json')
    this.sessionDirectory = join(managed, 'live-session')
  }

  static async restorePreviousInstall(gameRoot: string): Promise<void> {
    if (process.platform !== 'win32') return
    await WindowsNextClientInstallation.pendingRestore.catch(() => undefined)
    const installation = new WindowsNextClientInstallation(gameRoot)
    for (const path of [
      gameRoot,
      join(gameRoot, 'cstrike'),
      join(gameRoot, 'cstrike', 'cl_dlls')
    ]) {
      const entry = await lstat(path)
      if (!entry.isDirectory() || entry.isSymbolicLink())
        throw new Error('NextClient directory contains an unsupported link')
    }
    const managed = await lstat(installation.managedPath).catch(missingOnly)
    if (!managed) return
    if (!managed.isDirectory() || managed.isSymbolicLink())
      throw new Error('NextClient integration directory contains an unsupported link')
    await installation.restore()
  }

  static async install(gameRoot: string): Promise<WindowsNextClientInstallation> {
    if (process.platform !== 'win32') throw new Error('NextClient integration requires Windows')
    if (!(await isNextClientInstallation(gameRoot))) throw new Error('NextClient was not detected')
    await WindowsNextClientInstallation.pendingRestore.catch(() => undefined)
    const installation = new WindowsNextClientInstallation(gameRoot)

    for (const path of [
      gameRoot,
      join(gameRoot, 'cstrike'),
      join(gameRoot, 'cstrike', 'cl_dlls')
    ]) {
      const entry = await lstat(path)
      if (!entry.isDirectory() || entry.isSymbolicLink())
        throw new Error('NextClient directory contains an unsupported link')
    }
    const miniEntry = await lstat(installation.miniPath)
    if (!miniEntry.isFile() || miniEntry.isSymbolicLink())
      throw new Error('NextClient client_mini.dll contains an unsupported link')
    const existingManaged = await lstat(installation.managedPath).catch(missingOnly)
    if (existingManaged && (!existingManaged.isDirectory() || existingManaged.isSymbolicLink()))
      throw new Error('NextClient integration directory contains an unsupported link')
    await mkdir(installation.managedPath, { recursive: false }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error
      }
    )
    await installation.recover()

    const native = app.isPackaged
      ? join(process.resourcesPath, 'native')
      : join(app.getAppPath(), 'resources', 'native', 'win-x64')
    await verifyPackagedHelper(join(native, 'game-inspector.exe'))
    const envelope: unknown = JSON.parse(await readFile(join(native, 'manifest.json'), 'utf8'))
    const manifest = verifyHelperRelease(envelope, releaseConfig.publicKeyPem)
    if (manifest.platform !== 'win' || manifest.arch !== 'x64')
      throw new Error('Wrong NextClient integration target')
    const cosmetic = await readFile(join(native, 'papamo-cosmetic-module-win-x86.dll'))
    const customMini = await readFile(join(native, 'papamo-nextclient-client-mini-win-x86.dll'))
    verifyCosmeticModule(cosmetic, manifest)
    verifyNextClientModule(customMini, manifest)

    const originalMini = await readFile(installation.miniPath)
    const existingCosmeticEntry = await lstat(installation.cosmeticPath).catch(missingOnly)
    if (
      existingCosmeticEntry &&
      (!existingCosmeticEntry.isFile() ||
        existingCosmeticEntry.isSymbolicLink() ||
        hash(await readFile(installation.cosmeticPath)) !== hash(cosmetic))
    )
      throw new Error('An unmanaged cosmetic module already exists in NextClient')

    if (
      (await lstat(installation.originalMiniPath).catch(missingOnly)) ||
      (await lstat(installation.journalPath).catch(missingOnly)) ||
      (await lstat(installation.sessionDirectory).catch(missingOnly))
    )
      throw new Error('Existing NextClient integration state needs inspection')

    const miniTemporary = `${installation.miniPath}.16competitive.tmp`
    const cosmeticTemporary = `${installation.cosmeticPath}.16competitive.tmp`
    try {
      await copyFile(installation.miniPath, installation.originalMiniPath, constants.COPYFILE_EXCL)
      const journal: Journal = {
        originalMiniSha256: hash(originalMini),
        customMiniSha256: hash(customMini),
        cosmeticSha256: hash(cosmetic),
        ownsCosmetic: !existingCosmeticEntry
      }
      await writeFile(installation.journalPath, JSON.stringify(journal), {
        flag: 'wx',
        mode: 0o600
      })
      await armWindowsIntegrationRecovery(gameRoot, join(native, 'game-inspector.exe'))
      await writeFile(miniTemporary, customMini, { flag: 'wx' })
      await rename(miniTemporary, installation.miniPath)
      if (!existingCosmeticEntry) {
        await writeFile(cosmeticTemporary, cosmetic, { flag: 'wx' })
        await rename(cosmeticTemporary, installation.cosmeticPath)
      }
      await mkdir(installation.sessionDirectory, { recursive: false })
      return installation
    } catch (error) {
      await installation.restore().catch(() => undefined)
      await rm(miniTemporary, { force: true }).catch(() => undefined)
      await rm(cosmeticTemporary, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private async recover(): Promise<void> {
    if (await restoreWindowsIntegration(this.gameRoot)) return
    const journalBytes = await readFile(this.journalPath).catch(missingOnly)
    if (!journalBytes) return
    if (journalBytes.length > 512) throw new Error('Invalid NextClient integration journal')
    const journal = JSON.parse(journalBytes.toString('utf8')) as Partial<Journal>
    if (
      !journal.originalMiniSha256 ||
      !journal.customMiniSha256 ||
      !journal.cosmeticSha256 ||
      typeof journal.ownsCosmetic !== 'boolean' ||
      ![journal.originalMiniSha256, journal.customMiniSha256, journal.cosmeticSha256].every(
        (value) => /^[a-f0-9]{64}$/.test(value)
      )
    )
      throw new Error('Invalid NextClient integration journal')

    const original = await readFile(this.originalMiniPath)
    const current = await readFile(this.miniPath)
    const originalHash = hash(original)
    const currentHash = hash(current)
    if (
      originalHash !== journal.originalMiniSha256 ||
      ![journal.originalMiniSha256, journal.customMiniSha256].includes(currentHash)
    )
      throw new Error('NextClient client_mini.dll changed during integration')
    if (currentHash === journal.customMiniSha256)
      await copyFile(this.originalMiniPath, this.miniPath)

    if (journal.ownsCosmetic) {
      const cosmetic = await readFile(this.cosmeticPath).catch(missingOnly)
      if (cosmetic && hash(cosmetic) !== journal.cosmeticSha256)
        throw new Error('NextClient cosmetic module changed during integration')
      if (cosmetic) await rm(this.cosmeticPath)
    }
    await rm(this.sessionDirectory, { recursive: true, force: true })
    await rm(`${this.miniPath}.16competitive.tmp`, { force: true })
    await rm(`${this.cosmeticPath}.16competitive.tmp`, { force: true })
    await rm(this.originalMiniPath)
    await rm(this.journalPath)
  }

  async restore(): Promise<void> {
    if (await restoreWindowsIntegration(this.gameRoot)) return
    await rm(this.sessionDirectory, { recursive: true, force: true }).catch(() => undefined)
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await this.recover()
        return
      } catch (error) {
        if (attempt === 29) throw error
        await pause(500)
      }
    }
  }

  queueRestore(): Promise<void> {
    const cleanup = this.restore()
    WindowsNextClientInstallation.pendingRestore = cleanup
    return cleanup
  }
}
