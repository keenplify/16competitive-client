import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { app } from 'electron'
import { verifyPackagedHelper } from '../anticheat/helper-integrity'
import { upgradeRecoveryHelper, type RecoveryDescriptor } from './recovery-helper-upgrade'

const descriptorPath = (root: string): string => join(root, '16competitive', 'recovery.json')

async function runRecovery(
  root: string,
  descriptor: RecoveryDescriptor,
  mode: 'guard' | 'restore'
): Promise<void> {
  await verifyPackagedHelper(descriptor.helperPath)
  const helper = await readFile(descriptor.helperPath)
  if (createHash('sha256').update(helper).digest('hex') !== descriptor.helperSha256)
    throw new Error('Cosmetic recovery helper changed')
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      descriptor.helperPath,
      ['--cosmetic-recovery', root, descriptor.sessionId, String(process.pid), mode],
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
      mode === 'guard' ? 10_000 : 55_000
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
      if (mode === 'restore' && code === 0) resolve()
      else reject(new Error('Cosmetic recovery helper could not complete restoration'))
    })
  })
}

/** Arm crash recovery before changing a DLL. Older helper bundles fail closed. */
export async function armWindowsIntegrationRecovery(
  root: string,
  helperPath: string
): Promise<void> {
  const descriptor: RecoveryDescriptor = {
    helperPath,
    helperSha256: createHash('sha256')
      .update(await readFile(helperPath))
      .digest('hex'),
    sessionId: randomUUID()
  }
  await writeFile(descriptorPath(root), JSON.stringify(descriptor), { flag: 'wx', mode: 0o600 })
  try {
    await runRecovery(root, descriptor, 'guard')
  } catch (error) {
    await rm(descriptorPath(root), { force: true })
    throw error
  }
}

/** Both the native restart worker and Electron serialize through the helper's
 * Windows mutex. Keep legacy journals on their existing recovery path. */
export async function restoreWindowsIntegration(root: string): Promise<boolean> {
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
    !isAbsolute(descriptor.helperPath) ||
    typeof descriptor.helperSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(descriptor.helperSha256) ||
    typeof descriptor.sessionId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(descriptor.sessionId)
  )
    throw new Error('Invalid cosmetic recovery descriptor')
  const currentHelperPath = app.isPackaged
    ? join(process.resourcesPath, 'native', 'game-inspector.exe')
    : join(app.getAppPath(), 'resources', 'native', 'win-x64', 'game-inspector.exe')
  const currentDescriptor = await upgradeRecoveryHelper(
    path,
    contents,
    descriptor as RecoveryDescriptor,
    currentHelperPath,
    verifyPackagedHelper
  )
  await runRecovery(root, currentDescriptor, 'restore')
  return true
}
