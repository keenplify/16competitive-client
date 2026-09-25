import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { join } from 'node:path'
import { verifyPackagedHelper } from './helper-integrity'
import { REQUIRES_SIGNED_HELPER } from '../config'

function helperBinary(): string {
  const platform = process.platform === 'win32' ? 'win' : process.platform
  if (!['win', 'linux'].includes(platform))
    throw new Error('The anti-cheat helper does not support this platform.')
  const name = process.platform === 'win32' ? 'game-inspector.exe' : 'game-inspector'
  const binary = app.isPackaged
    ? join(process.resourcesPath, 'native', name)
    : join(app.getAppPath(), 'resources', 'native', `${platform}-${process.arch}`, name)
  return binary
}

export async function assertHelperForBackend(): Promise<void> {
  if (REQUIRES_SIGNED_HELPER) await verifyPackagedHelper(helperBinary())
}

export async function spawnHelper(
  mode: '--session' | '--device'
): Promise<ChildProcessWithoutNullStreams> {
  const binary = helperBinary()
  if (REQUIRES_SIGNED_HELPER) await verifyPackagedHelper(binary)
  return spawn(binary, [mode], {
    windowsHide: true,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    // Authentication is sent over stdin. No user environment, session token, or signing secret is inherited.
    env:
      process.platform === 'win32'
        ? { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR }
        : { LANG: 'C' }
  })
}

export function writeHelper(child: ChildProcessWithoutNullStreams, value: unknown): void {
  const line = JSON.stringify(value) + '\n'
  if (Buffer.byteLength(line) > 16384 || child.stdin.destroyed || !child.stdin.writable)
    throw new Error('Anti-cheat helper control channel is unavailable.')
  child.stdin.write(line)
}

export async function requestHelperDevice(value: unknown): Promise<unknown> {
  const child = await spawnHelper('--device')
  return new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('Anti-cheat device check timed out.'))
    }, 20_000)
    child.stderr.resume() // Never relay helper errors or backend response bodies to logs.
    const fail = (): void => {
      clearTimeout(timeout)
      child.kill()
      reject(new Error('Anti-cheat device check failed.'))
    }
    child.once('error', fail)
    child.stdin.once('error', fail)
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
      if (Buffer.byteLength(output) > 8192) fail()
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      if (code !== 0) return fail()
      try {
        resolve(JSON.parse(output))
      } catch {
        fail()
      }
    })
    try {
      writeHelper(child, value)
      child.stdin.end()
    } catch {
      fail()
    }
  })
}
