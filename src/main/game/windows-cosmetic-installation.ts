import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { recoverWindowsCosmeticInstallation } from './windows-cosmetic-recovery'
import {
  armWindowsIntegrationRecovery,
  prepareWonIntegration,
  restoreWindowsIntegration
} from './windows-integration-recovery'
import releaseConfig from '../../../helper-release.json'
import { verifyPackagedHelper } from '../anticheat/helper-integrity'
import { verifyCosmeticModule, verifyHelperRelease } from '../anticheat/helper-release-verifier'
import {
  isNextClientInstallation,
  supportsWindowsCosmeticClient
} from './windows-cosmetic-compatibility'
import {
  GOLDSRC_COSMETIC_CAPABILITIES,
  detectGoldSrcCosmeticFamily,
  type GoldSrcModDirectory,
  type CosmeticRuntime
} from './goldsrc-client-capabilities'
import type { RecoveryDescriptor } from './recovery-helper-upgrade'

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const missingOnly = (error: unknown): null => {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
  throw error
}

type Journal = {
  originalSha256: string
  moduleSha256: string
  ownsBackup: boolean
  wonLoader?: true
}

/** The proxy is opt-in for a match and is restored after GoldSrc exits. */
export class WindowsCosmeticInstallation {
  private static pendingRestore: Promise<void> = Promise.resolve()
  readonly sessionDirectory: string
  private readonly clientPath: string
  private readonly originalPath: string
  private readonly journalPath: string

  private constructor(
    private readonly gameRoot: string,
    private readonly gameDirectory: GoldSrcModDirectory = 'cstrike',
    private readonly runtime: CosmeticRuntime = 'native'
  ) {
    this.clientPath = join(gameRoot, gameDirectory, 'cl_dlls', 'client.dll')
    // The proxy's PE forwarded exports resolve this name from the EXE root.
    this.originalPath = join(gameRoot, 'client_original.dll')
    this.journalPath = join(gameRoot, '16competitive', 'cosmetic-install.json')
    this.sessionDirectory = join(gameRoot, '16competitive', 'live-session')
  }

  /** Undo a proxy left behind by an interrupted 2026.927.2 launch. */
  static async restorePreviousInstall(
    gameRoot: string,
    gameDirectory: GoldSrcModDirectory = 'cstrike',
    runtime: CosmeticRuntime = 'native'
  ): Promise<void> {
    if (process.platform !== 'win32' && !(process.platform === 'linux' && runtime === 'wine'))
      return
    await WindowsCosmeticInstallation.pendingRestore.catch(() => undefined)
    await new WindowsCosmeticInstallation(gameRoot, gameDirectory, runtime).restore()
  }

  static async install(
    gameRoot: string,
    gameDirectory: GoldSrcModDirectory = 'cstrike',
    runtime: CosmeticRuntime = 'native',
    authFile?: RecoveryDescriptor['authFile']
  ): Promise<WindowsCosmeticInstallation | null> {
    if (process.platform !== 'win32' && !(process.platform === 'linux' && runtime === 'wine'))
      throw new Error('Windows cosmetic installation requires Windows')
    await WindowsCosmeticInstallation.pendingRestore.catch(() => undefined)
    const installation = new WindowsCosmeticInstallation(gameRoot, gameDirectory, runtime)
    await installation.recover()
    if (gameDirectory === 'cstrike' && (await isNextClientInstallation(gameRoot))) {
      console.info('[Scoreboard] NextClient uses its own client hooks; using stock HUD')
      return null
    }
    const original = await readFile(installation.clientPath)
    const family = await detectGoldSrcCosmeticFamily(gameRoot, gameDirectory)
    const clientSha256 = hash(original)
    if (!family || !supportsWindowsCosmeticClient(original, family)) {
      console.info('[Scoreboard] Windows client is incompatible with the cosmetic proxy ABI', {
        clientSha256
      })
      return null
    }
    if (!GOLDSRC_COSMETIC_CAPABILITIES[family].managedProxyMatches) {
      console.info(
        '[Scoreboard] Legacy client requires its original DLL for server MD5 compatibility; using stock HUD'
      )
      return null
    }
    console.info('[Scoreboard] Windows client passed cosmetic proxy ABI checks', {
      clientSha256
    })
    const native = app.isPackaged
      ? join(process.resourcesPath, 'native', ...(runtime === 'wine' ? ['wine'] : []))
      : join(
          app.getAppPath(),
          'resources',
          'native',
          ...(runtime === 'wine' ? [`linux-${process.arch}`, 'wine'] : ['win-x64'])
        )
    await verifyPackagedHelper(join(native, 'game-inspector.exe'), undefined, runtime === 'wine')
    const envelope: unknown = JSON.parse(await readFile(join(native, 'manifest.json'), 'utf8'))
    const manifest = verifyHelperRelease(envelope, releaseConfig.publicKeyPem)
    if (manifest.platform !== 'win' || manifest.arch !== 'x64')
      throw new Error('Wrong cosmetic module target')
    const module = await readFile(join(native, 'papamo-cosmetic-module-win-x86.dll'))
    verifyCosmeticModule(module, manifest)
    if (family === 'won13' && !module.includes(Buffer.from('papamo_won_loader_v1\0'))) {
      console.info(
        '[Scoreboard] Signed cosmetic bundle predates WON compatibility; using stock HUD'
      )
      return null
    }

    for (const path of [
      gameRoot,
      join(gameRoot, gameDirectory),
      join(gameRoot, gameDirectory, 'cl_dlls')
    ]) {
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
    if (
      (await lstat(installation.journalPath).catch(missingOnly)) ||
      (await lstat(installation.sessionDirectory).catch(missingOnly))
    )
      throw new Error('Existing cosmetic installation or client backup needs inspection')
    await mkdir(join(gameRoot, '16competitive'), { recursive: true })
    const existingBackup = await lstat(installation.originalPath).catch(missingOnly)
    if (
      existingBackup &&
      (!existingBackup.isFile() ||
        existingBackup.isSymbolicLink() ||
        hash(await readFile(installation.originalPath)) !== hash(original))
    )
      throw new Error('Existing original client backup does not match Counter-Strike')
    const destination =
      family === 'won13'
        ? join(gameRoot, gameDirectory, 'cl_dlls', '16cmod.dll')
        : installation.clientPath
    const temporary = `${destination}.16competitive.tmp`
    if (await lstat(temporary).catch(missingOnly))
      throw new Error('Existing cosmetic staging file needs inspection')
    if (family === 'won13' && (await lstat(destination).catch(missingOnly)))
      throw new Error('Existing WON cosmetic module needs inspection')
    if (family === 'won13') {
      for (const name of ['won-hw.original.dll', 'won-hw.pending.dll']) {
        if (await lstat(join(gameRoot, '16competitive', name)).catch(missingOnly))
          throw new Error('Existing WON engine recovery files need inspection')
      }
    }
    if (!existingBackup)
      await copyFile(installation.clientPath, installation.originalPath, constants.COPYFILE_EXCL)
    let recoveryArmed = false
    let journalWritten = false
    try {
      if (hash(await readFile(installation.originalPath)) !== hash(original))
        throw new Error('Original Counter-Strike client changed during backup')
      const journal: Journal = {
        originalSha256: hash(original),
        moduleSha256: hash(module),
        ownsBackup: !existingBackup,
        ...(family === 'won13' ? { wonLoader: true as const } : {})
      }
      await writeFile(installation.journalPath, JSON.stringify(journal), { flag: 'wx' })
      journalWritten = true
      const recovery = await armWindowsIntegrationRecovery(
        gameRoot,
        join(native, 'game-inspector.exe'),
        runtime,
        gameDirectory,
        authFile
      )
      recoveryArmed = true
      await writeFile(temporary, module, { flag: 'wx' })
      if (family === 'won13') await prepareWonIntegration(gameRoot, recovery, runtime)
      else await rename(temporary, installation.clientPath)
      await mkdir(installation.sessionDirectory, { recursive: false })
      return installation
    } catch (error) {
      // No game file has changed before recovery is armed. Avoid leaving a
      // new-format journal that an older verified helper cannot interpret.
      if (journalWritten && !recoveryArmed) await rm(installation.journalPath, { force: true })
      await installation.restore().catch(() => undefined)
      // Recovery verifies staged files before deletion. Preserve unknown changes
      // and its journal if restoration fails.
      if (
        !existingBackup &&
        !(await lstat(installation.journalPath).catch(missingOnly)) &&
        hash(await readFile(installation.clientPath)) === hash(original)
      )
        await rm(installation.originalPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private async recover(): Promise<void> {
    if (await restoreWindowsIntegration(this.gameRoot, this.runtime)) return
    await recoverWindowsCosmeticInstallation(this.gameRoot, this.gameDirectory)
  }

  async restore(): Promise<void> {
    // An exiting hl.exe can briefly hold client.dll open. Leave the journal and
    // original in place if restoration fails; the next launch recovers them.
    if (await restoreWindowsIntegration(this.gameRoot, this.runtime)) return
    await rm(this.sessionDirectory, { recursive: true, force: true }).catch(() => undefined)
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await this.recover()
        return
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (attempt === 29 || !['EACCES', 'EBUSY', 'EPERM'].includes(code ?? '')) throw error
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
