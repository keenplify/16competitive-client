import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { app } from 'electron'
import { verifyPackagedHelper } from '../anticheat/helper-integrity'
import { upgradeRecoveryHelper, type RecoveryDescriptor } from './recovery-helper-upgrade'
import {
  toWinePath,
  fromWinePath,
  type CosmeticRuntime,
  type GoldSrcModDirectory
} from './goldsrc-client-capabilities'

const descriptorPath = (root: string): string => join(root, '16competitive', 'recovery.json')

async function runRecovery(
  root: string,
  descriptor: RecoveryDescriptor,
  mode: 'guard' | 'restore' | 'prepare-won',
  runtime: CosmeticRuntime = 'native'
): Promise<void> {
  const wine = runtime === 'wine'
  const helperPath = wine ? fromWinePath(descriptor.helperPath) : descriptor.helperPath
  await verifyPackagedHelper(helperPath, undefined, wine)
  const helper = await readFile(helperPath)
  if (createHash('sha256').update(helper).digest('hex') !== descriptor.helperSha256)
    throw new Error('Cosmetic recovery helper changed')
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      wine ? 'wine' : helperPath,
      [
        ...(wine ? [helperPath] : []),
        '--cosmetic-recovery',
        wine ? toWinePath(root) : root,
        descriptor.sessionId,
        wine && mode === 'guard' ? '0' : String(process.pid),
        wine && mode === 'guard' ? 'guard-lease' : mode
      ],
      {
        detached: mode === 'guard',
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore']
      }
    )
    let ready = false
    let output = ''
    const timer = setTimeout(
      () => {
        child.kill()
        reject(new Error('Cosmetic recovery helper timed out'))
      },
      mode === 'guard' ? (wine ? 45_000 : 10_000) : 55_000
    )
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.stdout?.on('data', (bytes: Buffer) => {
      output += bytes.toString('utf8')
      if (output.length > 128) {
        child.kill()
        clearTimeout(timer)
        reject(new Error('Invalid cosmetic recovery response'))
      } else if (mode === 'guard' && output === '16c-recovery-ready\n') {
        ready = true
        clearTimeout(timer)
        child.stdout?.destroy()
        child.unref()
        resolve()
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (ready) return
      if (mode !== 'guard' && code === 0) resolve()
      else reject(new Error('Cosmetic recovery helper could not complete restoration'))
    })
  })
}

/** Arm crash recovery before changing a DLL. Older helper bundles fail closed. */
export async function armWindowsIntegrationRecovery(
  root: string,
  helperPath: string,
  runtime: CosmeticRuntime = 'native',
  gameDirectory: GoldSrcModDirectory = 'cstrike',
  authFile?: RecoveryDescriptor['authFile']
): Promise<RecoveryDescriptor> {
  const descriptor: RecoveryDescriptor = {
    helperPath: runtime === 'wine' ? toWinePath(helperPath) : helperPath,
    helperSha256: createHash('sha256')
      .update(await readFile(helperPath))
      .digest('hex'),
    sessionId: randomUUID(),
    ...(gameDirectory !== 'cstrike' ? { gameDirectory } : {}),
    ...(authFile ? { authFile } : {})
  }
  await writeFile(descriptorPath(root), JSON.stringify(descriptor), { flag: 'wx', mode: 0o600 })
  try {
    await runRecovery(root, descriptor, 'guard', runtime)
  } catch (error) {
    await rm(descriptorPath(root), { force: true })
    throw error
  }
  return descriptor
}

export async function prepareWonIntegration(
  root: string,
  descriptor: RecoveryDescriptor,
  runtime: CosmeticRuntime
): Promise<void> {
  await runRecovery(root, descriptor, 'prepare-won', runtime)
}

/** Both the native restart worker and Electron serialize through the helper's
 * Windows mutex. Keep legacy journals on their existing recovery path. */
export async function restoreWindowsIntegration(
  root: string,
  runtime: CosmeticRuntime = 'native'
): Promise<boolean> {
  const path = descriptorPath(root)
  const entry = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!entry) return false
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 4096)
    throw new Error('Invalid cosmetic recovery descriptor')
  const contents = await readFile(path, 'utf8')
  const value: unknown = JSON.parse(contents)
  if (!value || typeof value !== 'object') throw new Error('Invalid cosmetic recovery descriptor')
  const descriptor = value as Partial<RecoveryDescriptor>
  if (
    typeof descriptor.helperPath !== 'string' ||
    !(runtime === 'wine'
      ? /^Z:\\/i.test(descriptor.helperPath)
      : isAbsolute(descriptor.helperPath)) ||
    typeof descriptor.helperSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(descriptor.helperSha256) ||
    typeof descriptor.sessionId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(descriptor.sessionId) ||
    (descriptor.gameDirectory !== undefined &&
      !['cstrike', 'cstrk13'].includes(descriptor.gameDirectory)) ||
    (descriptor.authFile !== undefined &&
      (!/^16c13_[a-f0-9]{16}\.cfg$/.test(descriptor.authFile.name) ||
        !/^[a-f0-9]{64}$/.test(descriptor.authFile.sha256)))
  )
    throw new Error('Invalid cosmetic recovery descriptor')
  const currentHelperPath =
    runtime === 'wine'
      ? app.isPackaged
        ? join(process.resourcesPath, 'native', 'wine', 'game-inspector.exe')
        : join(
            app.getAppPath(),
            'resources',
            'native',
            `linux-${process.arch}`,
            'wine',
            'game-inspector.exe'
          )
      : app.isPackaged
        ? join(process.resourcesPath, 'native', 'game-inspector.exe')
        : join(app.getAppPath(), 'resources', 'native', 'win-x64', 'game-inspector.exe')
  const currentDescriptor = await upgradeRecoveryHelper(
    path,
    contents,
    descriptor as RecoveryDescriptor,
    currentHelperPath,
    (path) => verifyPackagedHelper(path, undefined, runtime === 'wine'),
    runtime === 'wine' ? toWinePath(currentHelperPath) : currentHelperPath
  )
  await runRecovery(root, currentDescriptor, 'restore', runtime)
  return true
}
