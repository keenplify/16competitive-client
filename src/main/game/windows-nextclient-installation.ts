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
import { armWindowsIntegrationRecovery } from './windows-integration-recovery'
import {
  readNativeFile,
  replacePersistentNativeFile,
  replaceNativeMetadata,
  verifyPersistentNativeFile
} from './persistent-native-file'

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
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

/** Persistent signed NextClient host pair; only session data expires after play. */
export class WindowsNextClientInstallation {
  private static pendingRestore: Promise<void> = Promise.resolve()
  readonly sessionDirectory: string
  private readonly managedPath: string
  private readonly miniPath: string
  private readonly originalMiniPath: string
  private readonly cosmeticPath: string
  private readonly journalPath: string

  private constructor(gameRoot: string) {
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

    if (!cosmetic.includes(Buffer.from('papamo_persistent_session_v1')))
      throw new Error('The approved native bundle needs persistent-session support')
    const previousBytes = await readNativeFile(installation.journalPath).catch(missingOnly)
    if (previousBytes) {
      if (previousBytes.length > 512) throw new Error('Invalid persistent NextClient journal')
      const previous = JSON.parse(previousBytes.toString('utf8')) as Partial<Journal>
      if (
        !previous.originalMiniSha256 ||
        !previous.customMiniSha256 ||
        !previous.cosmeticSha256 ||
        typeof previous.ownsCosmetic !== 'boolean' ||
        ![previous.originalMiniSha256, previous.customMiniSha256, previous.cosmeticSha256].every(
          (value) => /^[a-f0-9]{64}$/.test(value)
        ) ||
        hash(await readNativeFile(installation.originalMiniPath)) !== previous.originalMiniSha256
      )
        throw new Error('Invalid persistent NextClient journal')
      await verifyPersistentNativeFile(installation.miniPath, previous.customMiniSha256, customMini)
      await verifyPersistentNativeFile(installation.cosmeticPath, previous.cosmeticSha256, cosmetic)
      if (!previous.ownsCosmetic && hash(cosmetic) !== previous.cosmeticSha256)
        throw new Error('An existing unowned cosmetic module needs manual updating')
      await replacePersistentNativeFile(
        installation.miniPath,
        previous.customMiniSha256,
        customMini
      )
      if (previous.ownsCosmetic)
        await replacePersistentNativeFile(
          installation.cosmeticPath,
          previous.cosmeticSha256,
          cosmetic
        )
      await replaceNativeMetadata(
        installation.journalPath,
        Buffer.from(
          JSON.stringify({
            ...previous,
            customMiniSha256: hash(customMini),
            cosmeticSha256: hash(cosmetic)
          })
        )
      )
      await mkdir(installation.sessionDirectory, { recursive: false })
      return installation
    }
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
      await armWindowsIntegrationRecovery(
        gameRoot,
        join(native, 'game-inspector.exe'),
        'native',
        'cstrike',
        undefined,
        undefined,
        false
      )
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
    await rm(this.sessionDirectory, { recursive: true, force: true })
  }

  async restore(): Promise<void> {
    await this.recover()
  }

  queueRestore(): Promise<void> {
    const cleanup = this.restore()
    WindowsNextClientInstallation.pendingRestore = cleanup
    return cleanup
  }
}
