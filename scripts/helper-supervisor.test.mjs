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

async function harness() {
  const children = []
  const intervals = []
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
    '../auth': { getSessionToken: () => token },
    '../config': {
      API_BASE_URL: 'https://api.example.test',
      LOCAL_DEVELOPMENT: false,
      REQUIRES_SIGNED_HELPER: false
    },
    './helper-integrity': { verifyPackagedHelper: async () => {} },
    './helper-process': {
      async spawnHelper() {
        if (failSpawn) throw new Error('invalid signature')
        const child = new EventEmitter()
        Object.assign(child, {
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          stdin: new PassThrough(),
          commands: [],
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
    start: module.namespace.startAntiCheatSession,
    setToken(value) {
      token = value
    },
    failSpawn() {
      failSpawn = true
    },
    tick(milliseconds = 0) {
      clock += milliseconds
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
