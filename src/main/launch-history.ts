import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { projectMatchDiagnostics } from '../shared/matchmaking-diagnostics'

const TTL = 6 * 60 * 60_000
const MAX_ENTRIES = 256
const MAX_BYTES = 256 * 1024
const FILE = /^[a-f0-9]{64}\.json$/
const INTERESTING =
  /^(join_queue|leave_queue|join_warmup|leave_warmup|leave_ffa|queue_joined|queue_left|match_found|match_ready_check|match_ready_response|match_server_starting|match_connect|match_cancelled|match_finished|game_process_[a-z_]+|authenticated|error|socket_closed)$/
const HISTORY_FIELDS = new Set([
  'type',
  'matchId',
  'mode',
  'state',
  'status',
  'code',
  'reason',
  'whileQueued',
  'phase',
  'osError',
  'errorKind',
  'cleanupCodes',
  'originalCode',
  'elevated',
  'installationSelected',
  'activeApiUrl',
  'hostApiUrl',
  'hasConnection',
  'authenticated',
  'attemptId'
])
function project(value: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(projectMatchDiagnostics(value)).filter(([key]) => HISTORY_FIELDS.has(key))
  )
}
interface Entry {
  at: number
  runId: string
  clientVersion: string
  stage: string
  data: Record<string, unknown>
}
interface State {
  ownerHash: string
  entries: Entry[]
  loaded: Promise<void>
  timer?: ReturnType<typeof setTimeout>
}

/** Local, account-scoped breadcrumbs. Only issue-report submission uploads them. */
export class LaunchHistory {
  private state: State | null = null
  private readonly runId = randomUUID()
  private writes = Promise.resolve()
  private unavailable = false

  constructor(
    private readonly directory: () => string,
    private readonly version: () => string,
    private readonly now: () => number = Date.now
  ) {}

  setOwner(owner: string | null): void {
    const ownerHash = owner ? createHash('sha256').update(owner).digest('hex') : null
    if (ownerHash === this.state?.ownerHash) return
    if (this.state) void this.save(this.state)
    this.state = null
    if (!ownerHash) return
    const state: State = { ownerHash, entries: [], loaded: Promise.resolve() }
    this.state = state
    state.loaded = this.writes
      .then(() => this.load(state))
      .catch(() => {
        this.unavailable = true
        console.warn('[LaunchHistory] Saved history could not be read')
      })
  }

  record(stage: string, event: unknown): void {
    const state = this.state
    if (!state || !/^[a-z_]{1,64}$/.test(stage)) return
    const data = project(event)
    const type = typeof data.type === 'string' ? data.type : ''
    if (!INTERESTING.test(type) || type === 'match_assets_progress') return
    // Progress counters and queue polling must not evict the actual launch.
    if (type === 'game_process_preparation' && data.phase === 'assets') return
    if (!type.startsWith('game_process_') || type === 'game_process_decision') {
      const previous = state.entries.findLast(
        (entry) =>
          entry.runId === this.runId &&
          entry.stage === stage &&
          entry.data.type === type &&
          entry.data.matchId === data.matchId
      )
      if (previous && JSON.stringify(previous.data) === JSON.stringify(data)) return
    }
    state.entries.push({
      at: this.now(),
      runId: this.runId,
      clientVersion: this.version(),
      stage,
      data
    })
    state.entries = this.recent(state.entries)
    if (!state.timer) {
      state.timer = setTimeout(() => {
        state.timer = undefined
        void this.save(state)
      }, 500)
      state.timer.unref()
    }
  }

  private recent(entries: Entry[]): Entry[] {
    const now = this.now()
    return entries
      .filter((entry) => entry.at <= now + 60_000 && now - entry.at <= TTL)
      .sort((a, b) => a.at - b.at)
      .slice(-MAX_ENTRIES)
  }

  private async load(state: State): Promise<void> {
    const directory = this.directory()
    try {
      const info = await lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid history directory')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    const path = join(directory, `${state.ownerHash}.json`)
    let file
    try {
      const info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid history file')
      file = await open(
        path,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    try {
      const info = await file.stat()
      if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Invalid history size')
      const buffer = Buffer.alloc(MAX_BYTES + 1)
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      if (bytesRead > MAX_BYTES) throw new Error('Invalid history size')
      const value: unknown = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'))
      if (!value || typeof value !== 'object') throw new Error('Invalid history')
      const saved = value as { schema?: unknown; ownerHash?: unknown; entries?: unknown }
      if (
        saved.schema !== 1 ||
        saved.ownerHash !== state.ownerHash ||
        !Array.isArray(saved.entries) ||
        saved.entries.length > MAX_ENTRIES
      )
        throw new Error('Invalid history owner/schema')
      const entries: Entry[] = []
      for (const item of saved.entries) {
        if (!item || typeof item !== 'object') continue
        const entry = item as Record<string, unknown>
        if (
          typeof entry.at !== 'number' ||
          !Number.isFinite(entry.at) ||
          typeof entry.runId !== 'string' ||
          !/^[a-f0-9-]{36}$/.test(entry.runId) ||
          typeof entry.clientVersion !== 'string' ||
          !/^[0-9.]{1,32}$/.test(entry.clientVersion) ||
          typeof entry.stage !== 'string' ||
          !/^[a-z_]{1,64}$/.test(entry.stage)
        )
          continue
        const data = project(entry.data)
        if (typeof data.type !== 'string' || !INTERESTING.test(data.type)) continue
        entries.push({
          at: entry.at,
          runId: entry.runId,
          clientVersion: entry.clientVersion,
          stage: entry.stage,
          data
        })
      }
      // Records made while disk IO was pending belong after the previous run.
      state.entries = this.recent([...entries, ...state.entries])
    } finally {
      await file.close()
    }
  }

  private save(state: State): Promise<void> {
    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = undefined
    }
    const operation = this.writes.then(async () => {
      await state.loaded
      const directory = this.directory()
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const info = await lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid history directory')
      state.entries = this.recent(state.entries)
      const bytes = JSON.stringify({
        schema: 1,
        ownerHash: state.ownerHash,
        entries: state.entries
      })
      if (Buffer.byteLength(bytes) > MAX_BYTES) throw new Error('History exceeds size limit')
      const destination = join(directory, `${state.ownerHash}.json`)
      const temporary = join(directory, `${randomUUID()}.tmp`)
      try {
        await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
        await rename(temporary, destination)
      } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error
        })
      }
      const files = await Promise.all(
        (await readdir(directory, { withFileTypes: true }))
          .filter((item) => item.isFile() && FILE.test(item.name))
          .map(async (item) => ({
            path: join(directory, item.name),
            at: (await lstat(join(directory, item.name))).mtimeMs
          }))
      )
      files.sort((a, b) => (a.path === destination ? -1 : b.path === destination ? 1 : b.at - a.at))
      for (const [index, item] of files.entries())
        if (item.path !== destination && (index >= 5 || this.now() - item.at > TTL))
          await unlink(item.path)
    })
    this.writes = operation.catch(() => {
      this.unavailable = true
      console.warn('[LaunchHistory] History could not be saved')
    })
    return this.writes
  }

  async flush(): Promise<void> {
    if (this.state) await this.save(this.state)
    else await this.writes
  }

  async report(): Promise<string> {
    const state = this.state
    if (!state) return JSON.stringify({ status: 'unavailable', reason: 'no_authenticated_account' })
    await state.loaded
    if (this.state !== state)
      return JSON.stringify({ status: 'unavailable', reason: 'account_changed' })
    state.entries = this.recent(state.entries)
    return JSON.stringify({
      capturedAt: new Date(this.now()).toISOString(),
      retentionHours: 6,
      currentRunId: this.runId,
      storageAvailable: !this.unavailable,
      note: 'Previous runs retained; missing events do not prove a launch was never attempted.',
      timeline: state.entries
    })
  }
}
