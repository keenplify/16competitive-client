/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(
  await readFile(new URL('../src/main/anticheat/anti-cheat.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
  }
).outputText
const settle = () => new Promise((resolve) => setImmediate(resolve))

async function harness({ signed = false } = {}) {
  class HelperApprovalConnectionError extends Error {}
  let verificationError = null
  let verificationCalls = 0
  const children = []
  const intervals = []
  const reports = []
  let token = 'fixture-session-bearer'
  let clock = Date.now()
  let failSpawn = false
  const context = vm.createContext({
    Buffer,
    process,
    console: {
      warn() {
        return undefined
      }
    },
    setTimeout,
    clearTimeout,
    Date: class extends Date {
      static now() {
        return clock
      }
    },
    setInterval(callback) {
      const item = {
        callback,
        active: true,
        unref() {
          return undefined
        }
      }
      intervals.push(item)
      return item
    },
    clearInterval(item) {
      item.active = false
    }
  })
  const dependencies = {
    electron: { app: { isPackaged: false } },
    '../matchmaking-regions': { resolveServiceApiUrl: async () => 'https://regional.example.test' },
    '../auth': { getSessionToken: () => token },
    '../config': {
      API_BASE_URL: 'https://api.example.test',
      LOCAL_DEVELOPMENT: false,
      REQUIRES_SIGNED_HELPER: signed
    },
    './failure-reports': {
      reportAntiCheatFailure: (stage, context) => reports.push({ stage, ...context })
    },
    './helper-integrity': {
      HelperApprovalConnectionError,
      verifyPackagedHelper: async () => {
        verificationCalls++
        if (verificationError) throw verificationError
      }
    },
    './game-screenshots': {
      GameScreenshotCollector: class {
        start() {
          return undefined
        }
        stop() {
          return undefined
        }
      }
    },
    './helper-process': {
      async spawnHelper(_mode, apiUrl) {
        if (failSpawn) throw new Error('invalid signature')
        const child = new EventEmitter()
        Object.assign(child, {
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          stdin: new PassThrough(),
          commands: [],
          apiUrl,
          kill() {
            child.emit('exit', 1)
          }
        })
        children.push(child)
        setImmediate(() => child.stdout.write('{"event":"ready","protocol":2}\n'))
        return child
      },
      writeHelper(child, value) {
        child.commands.push(value)
      }
    }
  }
  const module = new vm.SourceTextModule(source, { context })
  await module.link(async (name) => {
    const exports = dependencies[name]
    if (!exports) throw new Error(`Unexpected dependency ${name}`)
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  return {
    children,
    reports,
    start: module.namespace.startAntiCheatSession,
    setToken(value) {
      token = value
    },
    failSpawn() {
      failSpawn = true
    },
    setVerificationFailure(kind) {
      verificationError =
        kind === 'offline'
          ? new HelperApprovalConnectionError('offline')
          : kind
            ? new Error(kind)
            : null
    },
    verificationCalls: () => verificationCalls,
    tick(milliseconds = 0, heartbeat = false) {
      clock += milliseconds
      if (heartbeat) children.at(-1)?.stdout.write('{"event":"heartbeat"}\n')
      for (const interval of [...intervals]) if (interval.active) interval.callback()
    }
  }
}
const options = {
  matchId: '12345678-1234-4123-8123-123456789abc',
  executablePath: '/game/hl',
  runtimeExecutablePath: '/game/hl',
  gameDirectory: '/game',
  distribution: 'standalone'
}

test('supervisor forwards auth over control channel and stops on logout', async () => {
  const h = await harness()
  let failures = 0
  const session = await h.start({ ...options, onIntegrityFailure: () => failures++ })
  assert.equal(h.children[0].commands[0].token, 'fixture-session-bearer')
  h.setToken('rotated-bearer')
  h.tick()
  assert.equal(h.children[0].commands.at(-1).command, 'auth')
  assert.equal(h.children[0].commands.at(-1).token, 'rotated-bearer')
  h.setToken(null)
  h.tick()
  assert.equal(failures, 1)
  assert.equal(h.children[0].commands.at(-1).command, 'stop')
  session.stop('repeat')
  h.children[0].emit('exit', 0)
  assert.equal(failures, 1)
})

test('one recovery preserves attached PID; repeated failure closes the session once', async () => {
  const h = await harness()
  let failures = 0
  const session = await h.start({ ...options, onIntegrityFailure: () => failures++ })
  session.attachProcess(123)
  h.children[0].emit('exit', 1)
  await settle()
  await settle()
  assert.equal(h.children.length, 2)
  assert.equal(h.children[1].commands.at(-1).pid, 123)
  h.children[1].emit('exit', 1)
  await settle()
  assert.equal(failures, 1)
  h.children[0].emit('exit', 1)
  assert.equal(failures, 1)
})

test('stalled heartbeat triggers recovery; invalid signature prevents startup', async () => {
  const h = await harness()
  const session = await h.start(options)
  h.tick(31_000)
  await settle()
  await settle()
  assert.equal(h.children.length, 2)
  session.stop('done')
  h.children[1].emit('exit', 0)
  const bad = await harness()
  bad.failSpawn()
  await assert.rejects(bad.start(options), /invalid signature/)
  assert.equal(bad.children.length, 0)
})

test('unexpected helper exits report exit details and exhausted recovery without credentials', async () => {
  const h = await harness()
  const session = await h.start(options)
  h.children[0].emit('exit', 17, null)
  await settle()
  await settle()
  assert.equal(h.reports[0].stage, 'unexpected-exit')
  assert.equal(h.reports[0].exitCode, 17)
  assert.equal(h.reports[0].matchId, options.matchId)
  h.children[1].emit('exit', 18, null)
  await settle()
  assert(h.reports.some((report) => report.stage === 'recovery-exhausted'))
  assert(!JSON.stringify(h.reports).includes('fixture-session-bearer'))
  const count = h.reports.length
  session.stop('done')
  h.children[1].emit('exit', 0)
  assert.equal(h.reports.length, count)
})

test('startup and heartbeat failures report their own stages; logout does not', async () => {
  const bad = await harness()
  bad.failSpawn()
  await assert.rejects(bad.start(options))
  assert.equal(bad.reports[0].stage, 'session-start')
  assert.equal(bad.reports[0].error.message, 'invalid signature')
  const h = await harness()
  const session = await h.start(options)
  h.tick(31_000)
  await settle()
  await settle()
  assert.equal(h.reports[0].stage, 'heartbeat-timeout')
  h.setToken(null)
  h.tick()
  assert.equal(h.reports.length, 1)
  session.stop('done')
})

test('invalid protocol reports a category without leaking raw helper output', async () => {
  const h = await harness()
  const session = await h.start(options)
  h.children[0].stdout.write('invalid fixture-secret-output\n')
  await settle()
  await settle()
  assert.equal(h.reports[0].stage, 'invalid-protocol')
  assert(!h.reports.some((report) => report.stage === 'unexpected-exit'))
  assert(!JSON.stringify(h.reports).includes('fixture-secret-output'))
  session.stop('done')
})

test('match API is retained for helper startup and recovery; no match uses preferred region', async () => {
  const h = await harness()
  const session = await h.start({ ...options, apiUrl: 'https://match.example.test' })
  assert.equal(h.children[0].apiUrl, 'https://match.example.test')
  assert.equal(h.children[0].commands[0].apiUrl, 'https://match.example.test')
  h.children[0].emit('exit', 1)
  await settle()
  await settle()
  assert.equal(h.children[1].commands[0].apiUrl, 'https://match.example.test')
  session.stop('test')
  const preferred = await h.start(options)
  assert.equal(h.children.at(-1).commands[0].apiUrl, 'https://regional.example.test')
  preferred.stop('test')
})

test('an active signed session keeps its helper and game during a short approval outage', async () => {
  const h = await harness({ signed: true })
  let failures = 0
  const session = await h.start({ ...options, onIntegrityFailure: () => failures++ })
  h.setVerificationFailure('offline')
  h.tick(60_001, true)
  await settle()
  assert.equal(h.children.length, 1)
  assert.equal(failures, 0)
  h.tick(1_000, true)
  await settle()
  assert.equal(h.verificationCalls(), 1, 'retries are spaced apart')
  h.setVerificationFailure(null)
  h.tick(1_000, true)
  await settle()
  assert.equal(h.verificationCalls(), 2)
  assert.equal(h.children.length, 1)
  assert.equal(failures, 0)
  session.stop('done')
})

test('continued approval outage fails closed after a bounded minute', async () => {
  const h = await harness({ signed: true })
  let failures = 0
  const session = await h.start({ ...options, onIntegrityFailure: () => failures++ })
  h.setVerificationFailure('offline')
  h.tick(60_001, true)
  await settle()
  h.tick(30_000, true)
  await settle()
  assert.equal(failures, 0)
  h.tick(30_000, true)
  await settle()
  assert.equal(failures, 1)
  assert.equal(h.children.length, 1, 'does not restart the helper to reset the grace')
  session.stop('done')
})

test('explicit rejection or changed bytes cannot use the temporary outage grace', async () => {
  for (const error of ['not approved', 'signature verification failed', 'binary hash mismatch']) {
    const h = await harness({ signed: true })
    let failures = 0
    const session = await h.start({ ...options, onIntegrityFailure: () => failures++ })
    h.setVerificationFailure('offline')
    h.tick(60_001, true)
    await settle()
    h.setVerificationFailure(error)
    h.failSpawn()
    h.tick(2_000, true)
    await settle()
    await settle()
    assert.equal(failures, 1)
    session.stop('done')
  }
})
