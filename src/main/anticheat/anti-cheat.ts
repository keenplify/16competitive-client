import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { getSessionToken } from '../auth'
import { API_BASE_URL, LOCAL_DEVELOPMENT, REQUIRES_SIGNED_HELPER } from '../config'
import type { Cs16Distribution } from '../game/cs16-installation'
import { spawnHelper, writeHelper } from './helper-process'
import { verifyPackagedHelper } from './helper-integrity'

interface AntiCheatSessionOptions {
  matchId: string
  executablePath: string
  runtimeExecutablePath: string
  gameDirectory: string
  distribution: Cs16Distribution
  onProcessExit?: (processId: number) => void
  onIntegrityFailure?: () => void
}

/** Electron supervises the process. All scanning and observation uploads live in the private Rust helper. */
export class AntiCheatSession {
  private child: ChildProcessWithoutNullStreams | null = null
  private stopped = false
  private timer: NodeJS.Timeout | null = null
  private targetPid: number | null = null
  private discover = false
  private lastHeartbeat = 0
  private currentToken: string | null = null
  private restarts = 0
  private recovering = false
  private integrityChecking = false
  private lastIntegrityCheck = 0

  constructor(private readonly options: AntiCheatSessionOptions) {}

  async start(): Promise<void> {
    const token = getSessionToken()
    if (!token) throw new Error('Sign in before starting a competitive match.')
    const child = await spawnHelper('--session')
    if (this.stopped) {
      child.kill()
      return
    }
    this.child = child
    this.currentToken = token
    this.lastHeartbeat = Date.now()
    this.lastIntegrityCheck = Date.now()
    let output = ''
    await new Promise<void>((resolve, reject) => {
      let ready = false
      const startupTimeout = setTimeout(() => {
        child.kill()
        reject(new Error('Anti-cheat helper did not start. Please repair the launcher.'))
      }, 10_000)
      child.stderr.resume()
      const failed = (): void => {
        clearTimeout(startupTimeout)
        if (!ready)
          reject(new Error('Anti-cheat helper could not start. Please repair the launcher.'))
        else if (!this.stopped && this.child === child) void this.recover()
      }
      child.once('error', failed)
      child.stdin.on('error', failed)
      child.once('exit', failed)
      child.stdout.on('data', (chunk: Buffer) => {
        if (this.stopped || this.child !== child) return
        output += chunk.toString('utf8')
        if (Buffer.byteLength(output) > 8192) {
          child.kill()
          return
        }
        let end: number
        while ((end = output.indexOf('\n')) >= 0) {
          const line = output.slice(0, end)
          output = output.slice(end + 1)
          try {
            const value = JSON.parse(line) as Record<string, unknown>
            if (value.event === 'ready' && value.protocol === 2) {
              ready = true
              clearTimeout(startupTimeout)
              resolve()
            } else if (value.event === 'heartbeat') {
              this.lastHeartbeat = Date.now()
            } else if (
              value.event === 'process_exit' &&
              Number.isInteger(value.pid) &&
              value.pid === this.targetPid
            ) {
              console.info('[AntiCheat] game process exited', {
                matchId: this.options.matchId,
                pid: value.pid
              })
              this.targetPid = null
              this.options.onProcessExit?.(value.pid as number)
            } else if (
              value.event === 'attached' &&
              Number.isInteger(value.pid) &&
              Number(value.pid) > 0 &&
              this.discover
            ) {
              this.targetPid = Number(value.pid)
              console.info('[AntiCheat] game process attached', {
                matchId: this.options.matchId,
                pid: this.targetPid
              })
            } else if (value.event === 'report' && value.accepted === false) {
              console.warn('[AntiCheat] helper evidence upload unavailable', {
                matchId: this.options.matchId
              })
            }
          } catch {
            child.kill()
            return
          }
        }
      })
      try {
        writeHelper(child, {
          command: 'start',
          apiUrl: API_BASE_URL,
          token,
          allowInsecureLocal: LOCAL_DEVELOPMENT,
          matchId: this.options.matchId,
          executablePath: this.options.executablePath,
          runtimeExecutablePath: this.options.runtimeExecutablePath,
          gameDirectory: this.options.gameDirectory,
          distribution: this.options.distribution
        })
      } catch {
        child.kill()
        failed()
      }
    })
    if (this.stopped || this.child !== child) return
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => {
      if (Date.now() - this.lastHeartbeat > 30_000) {
        void this.recover()
        return
      }
      const token = getSessionToken()
      if (!token) {
        this.failClosed()
        return
      }
      if (token !== this.currentToken) {
        this.currentToken = token
        this.send({ command: 'auth', token })
      }
      if (
        REQUIRES_SIGNED_HELPER &&
        !this.integrityChecking &&
        Date.now() - this.lastIntegrityCheck >= 60_000
      ) {
        this.integrityChecking = true
        void verifyPackagedHelper(child.spawnfile)
          .then(() => {
            this.lastIntegrityCheck = Date.now()
          })
          .catch(() => {
            if (!this.stopped && this.child === child) void this.recover()
          })
          .finally(() => {
            this.integrityChecking = false
          })
      }
    }, 1000)
    this.timer.unref()
    if (this.targetPid) this.send({ command: 'attach', pid: this.targetPid })
    else if (this.discover) this.send({ command: 'discover' })
  }

  private send(value: unknown): void {
    if (!this.child || this.stopped) return
    try {
      writeHelper(this.child, value)
    } catch {
      void this.recover()
    }
  }

  private async recover(): Promise<void> {
    if (this.stopped || this.recovering) return
    this.recovering = true
    const child = this.child
    this.child = null
    child?.kill()
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.restarts++ >= 1) {
      this.failClosed()
      return
    }
    try {
      await this.start()
    } catch {
      this.failClosed()
    } finally {
      this.recovering = false
    }
  }

  private failClosed(): void {
    if (this.stopped) return
    this.stop('helper-unavailable')
    this.options.onIntegrityFailure?.()
  }

  attachProcess(processId: number): void {
    if (this.stopped || !Number.isInteger(processId) || processId < 1 || processId > 2147483647)
      return
    this.targetPid = processId
    this.discover = false
    this.send({ command: 'attach', pid: processId })
  }

  async attachWhenWindowsProcessAppears(_executablePath: string): Promise<void> {
    if (_executablePath !== this.options.runtimeExecutablePath) return
    if (process.platform !== 'win32' || this.stopped) return
    this.discover = true
    this.send({ command: 'discover' })
  }

  stop(reason: string): void {
    if (this.stopped) return
    this.send({ command: 'stop', reason: reason.slice(0, 120) || 'session-ended' })
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const child = this.child
    this.child = null
    child?.stdin.end()
    if (child) {
      const timeout = setTimeout(() => child.kill(), 6000)
      timeout.unref()
      child.once('exit', () => clearTimeout(timeout))
    }
  }
}

export const startAntiCheatSession = async (
  options: AntiCheatSessionOptions
): Promise<AntiCheatSession> => {
  const session = new AntiCheatSession(options)
  try {
    await session.start()
    return session
  } catch (error) {
    session.stop('startup-failed')
    throw error
  }
}
