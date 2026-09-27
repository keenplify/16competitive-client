import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import releaseConfig from '../../../helper-release.json'
import { verifyPackagedHelper } from '../anticheat/helper-integrity'
import { verifyCosmeticModule, verifyHelperRelease } from '../anticheat/helper-release-verifier'
import {
  isNextClientInstallation,
  supportsWindowsCosmeticClient
} from './windows-cosmetic-compatibility'

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const missingOnly = (error: unknown): null => {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
  throw error
}

type Journal = { originalSha256: string; moduleSha256: string; ownsBackup: boolean }

/** The proxy is opt-in for a match and is restored after GoldSrc exits. */
export class WindowsCosmeticInstallation {
  private static pendingRestore: Promise<void> = Promise.resolve()
  readonly sessionDirectory: string
  private readonly clientPath: string
  private readonly originalPath: string
  private readonly journalPath: string

  private constructor(gameRoot: string) {
    this.clientPath = join(gameRoot, 'cstrike', 'cl_dlls', 'client.dll')
    // The proxy's PE forwarded exports resolve this name from the EXE root.
    this.originalPath = join(gameRoot, 'client_original.dll')
    this.journalPath = join(gameRoot, '16competitive', 'cosmetic-install.json')
    this.sessionDirectory = join(gameRoot, '16competitive', 'live-session')
  }

  /** Undo a proxy left behind by an interrupted 2026.927.2 launch. */
  static async restorePreviousInstall(gameRoot: string): Promise<void> {
    if (process.platform !== 'win32') return
    await WindowsCosmeticInstallation.pendingRestore.catch(() => undefined)
    await new WindowsCosmeticInstallation(gameRoot).restore()
  }

  static async install(gameRoot: string): Promise<WindowsCosmeticInstallation | null> {
    if (process.platform !== 'win32') throw new Error('Windows cosmetic installation requires Windows')
    await WindowsCosmeticInstallation.pendingRestore.catch(() => undefined)
    const installation = new WindowsCosmeticInstallation(gameRoot)
    await installation.recover()
    if (await isNextClientInstallation(gameRoot)) {
      console.info('[Scoreboard] NextClient uses its own client hooks; using stock HUD')
      return null
    }
    const original = await readFile(installation.clientPath)
    const clientSha256 = hash(original)
    if (!supportsWindowsCosmeticClient(clientSha256)) {
      console.info('[Scoreboard] Windows client build is not verified for cosmetic overlay', {
        clientSha256
      })
      return null
    }
    const native = app.isPackaged
      ? join(process.resourcesPath, 'native')
      : join(app.getAppPath(), 'resources', 'native', 'win-x64')
    await verifyPackagedHelper(join(native, 'game-inspector.exe'))
    const envelope: unknown = JSON.parse(await readFile(join(native, 'manifest.json'), 'utf8'))
    const manifest = verifyHelperRelease(envelope, releaseConfig.publicKeyPem)
    if (manifest.platform !== 'win' || manifest.arch !== 'x64')
      throw new Error('Wrong cosmetic module target')
    const module = await readFile(join(native, 'papamo-cosmetic-module-win-x86.dll'))
    verifyCosmeticModule(module, manifest)

    for (const path of [gameRoot, join(gameRoot, 'cstrike'), join(gameRoot, 'cstrike', 'cl_dlls')]) {
      const entry = await lstat(path)
      if (!entry.isDirectory() || entry.isSymbolicLink())
        throw new Error('Counter-Strike directory contains an unsupported link')
    }
    const clientEntry = await lstat(installation.clientPath)
    if (!clientEntry.isFile() || clientEntry.isSymbolicLink())
      throw new Error('Counter-Strike client DLL contains an unsupported link')
    const managed = await lstat(join(gameRoot, '16competitive')).catch(missingOnly)
    if (managed && (!managed.isDirectory() || managed.isSymbolicLink()))
      throw new Error('Counter-Strike managed directory contains an unsupported link')
    if ((await lstat(installation.journalPath).catch(missingOnly)) ||
        (await lstat(installation.sessionDirectory).catch(missingOnly)))
      throw new Error('Existing cosmetic installation or client backup needs inspection')
    await mkdir(join(gameRoot, '16competitive'), { recursive: true })
    const existingBackup = await lstat(installation.originalPath).catch(missingOnly)
    if (existingBackup && (!existingBackup.isFile() || existingBackup.isSymbolicLink() ||
        hash(await readFile(installation.originalPath)) !== hash(original)))
      throw new Error('Existing original client backup does not match Counter-Strike')
    if (!existingBackup)
      await copyFile(installation.clientPath, installation.originalPath, constants.COPYFILE_EXCL)
    const temporary = `${installation.clientPath}.16competitive.tmp`
    try {
      if (hash(await readFile(installation.originalPath)) !== hash(original))
        throw new Error('Original Counter-Strike client changed during backup')
      const journal: Journal = {
        originalSha256: hash(original), moduleSha256: hash(module), ownsBackup: !existingBackup
      }
      await writeFile(installation.journalPath, JSON.stringify(journal), { flag: 'wx' })
      await writeFile(temporary, module, { flag: 'wx' })
      await rename(temporary, installation.clientPath)
      await mkdir(installation.sessionDirectory, { recursive: false })
      return installation
    } catch (error) {
      await installation.restore().catch(() => undefined)
      await rm(temporary, { force: true }).catch(() => undefined)
      if (!existingBackup && !(await lstat(installation.journalPath).catch(missingOnly)) &&
          hash(await readFile(installation.clientPath)) === hash(original))
        await rm(installation.originalPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private async recover(): Promise<void> {
    const journalBytes = await readFile(this.journalPath).catch(missingOnly)
    if (!journalBytes) return
    if (journalBytes.length > 256) throw new Error('Invalid cosmetic installation journal')
    const journal = JSON.parse(journalBytes.toString('utf8')) as Partial<Journal>
    if (!journal.originalSha256 || !journal.moduleSha256 ||
        typeof journal.ownsBackup !== 'boolean' ||
        !/^[a-f0-9]{64}$/.test(journal.originalSha256) ||
        !/^[a-f0-9]{64}$/.test(journal.moduleSha256))
      throw new Error('Invalid cosmetic installation journal')
    const original = await readFile(this.originalPath)
    const current = await readFile(this.clientPath)
    if (hash(original) !== journal.originalSha256 ||
        (hash(current) !== journal.moduleSha256 && hash(current) !== journal.originalSha256))
      throw new Error('Counter-Strike client changed after cosmetic installation')
    if (hash(current) === journal.moduleSha256) await copyFile(this.originalPath, this.clientPath)
    await rm(this.sessionDirectory, { recursive: true, force: true })
    await rm(`${this.clientPath}.16competitive.tmp`, { force: true })
    if (journal.ownsBackup) await rm(this.originalPath)
    await rm(this.journalPath)
  }

  async restore(): Promise<void> {
    // An exiting hl.exe can briefly hold client.dll open. Leave the journal and
    // original in place if restoration fails; the next launch recovers them.
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
    WindowsCosmeticInstallation.pendingRestore = cleanup
    return cleanup
  }
}
