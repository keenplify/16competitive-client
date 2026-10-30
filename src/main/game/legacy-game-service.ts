import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import type { LegacyGameError, LegacyGameProfile, LegacyGameResult } from '../../shared/legacy-game'
import { cs13Adapter, LegacyInstallationError } from './adapters/cs13'
import type { GameLaunchPlan } from './adapters/game-adapter'
import { findInstallation } from './installation-search'

interface LegacyGameDependencies {
  settingsPath: string
  platform: NodeJS.Platform
  chooseFolder: () => Promise<string | null>
  isBusy: () => boolean
  launch: (plan: GameLaunchPlan) => Promise<void>
}

const failure = (error: LegacyGameError): { ok: false; error: LegacyGameError } => ({
  ok: false,
  error
})

/** Separate local machine state: never changes the selected 1.6 installation. */
export class LegacyGameService {
  private working = false

  constructor(private readonly dependencies: LegacyGameDependencies) {}

  private async readFolder(): Promise<{ folderPath: string; validationPath: string } | null> {
    try {
      const value: unknown = JSON.parse(await readFile(this.dependencies.settingsPath, 'utf8'))
      if (typeof value !== 'object' || value === null) throw new Error('Invalid legacy profile')
      const folder = (value as Record<string, unknown>).folderPath
      const mod = (value as Record<string, unknown>).modDirectory
      if (typeof folder !== 'string' || folder.includes('\0') || !isAbsolute(folder))
        throw new Error('Invalid legacy folder')
      if (mod !== undefined && mod !== 'cstrike' && mod !== 'cstrk13')
        throw new Error('Invalid legacy mod directory')
      return { folderPath: folder, validationPath: mod ? join(folder, mod) : folder }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async get(): Promise<LegacyGameResult<LegacyGameProfile>> {
    try {
      const saved = await this.readFolder()
      if (!saved) return { ok: true, value: { folderPath: null, installation: null } }
      const folderPath = saved.folderPath
      const installation = await cs13Adapter
        .validateInstallation(saved.validationPath, this.dependencies.platform)
        .catch((error: unknown) => {
          if (error instanceof LegacyInstallationError) return null
          throw error
        })
      return { ok: true, value: { folderPath, installation } }
    } catch {
      return failure('settingsFailed')
    }
  }

  async choose(): Promise<LegacyGameResult<LegacyGameProfile | null>> {
    if (this.working || this.dependencies.isBusy()) return failure('busy')
    if (this.dependencies.platform !== 'win32' && this.dependencies.platform !== 'linux')
      return failure('unsupportedPlatform')
    this.working = true
    let temporary: string | undefined
    try {
      const folder = await this.dependencies.chooseFolder()
      if (folder === null) return { ok: true, value: null }
      const installation = await findInstallation(folder, async (candidate) => {
        if (
          candidate !== folder &&
          !(await stat(join(candidate, 'hl.exe')).catch(() => null))?.isFile() &&
          !(await stat(join(candidate, 'hl_linux')).catch(() => null))?.isFile()
        )
          return null
        try {
          return await cs13Adapter.validateInstallation(candidate, this.dependencies.platform)
        } catch (error) {
          if (error instanceof LegacyInstallationError) return null
          throw error
        }
      })
      if (!installation) throw new LegacyInstallationError('invalidInstallation')
      const destination = this.dependencies.settingsPath
      temporary = `${destination}.${randomUUID()}.tmp`
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(
        temporary,
        JSON.stringify({
          folderPath: installation.folderPath,
          modDirectory: installation.modDirectory
        }),
        {
          mode: 0o600,
          flag: 'wx'
        }
      )
      await rename(temporary, destination)
      return { ok: true, value: { folderPath: installation.folderPath, installation } }
    } catch (error) {
      console.warn('[LegacyGame] Installation selection failed', {
        code: error instanceof LegacyInstallationError ? error.code : 'settingsFailed'
      })
      return failure(error instanceof LegacyInstallationError ? error.code : 'settingsFailed')
    } finally {
      if (temporary) await unlink(temporary).catch(() => undefined)
      this.working = false
    }
  }

  async launch(): Promise<LegacyGameResult<null>> {
    if (this.working || this.dependencies.isBusy()) return failure('busy')
    this.working = true
    try {
      const folder = await this.readFolder()
      if (!folder) return failure('installationRequired')
      const installation = await cs13Adapter.validateInstallation(
        folder.validationPath,
        this.dependencies.platform
      )
      if (this.dependencies.isBusy()) return failure('busy')
      await this.dependencies.launch(cs13Adapter.buildMenuLaunchPlan(installation))
      return { ok: true, value: null }
    } catch (error) {
      const code = error instanceof LegacyInstallationError ? error.code : 'launchFailed'
      console.warn('[LegacyGame] Menu launch failed', { code })
      return failure(code)
    } finally {
      this.working = false
    }
  }
}
