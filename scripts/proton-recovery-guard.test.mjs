/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { build } from 'esbuild'
const bundle = await build({
  entryPoints: ['src/main/game/proton-recovery-guard.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false
})
const { protonRecoveryGuardSource } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
)

async function fixture({ game = false, alive = true, changed = false, tampered = false } = {}) {
  const binary = Buffer.from('approved helper')
  const hash = createHash('sha256').update(binary).digest('hex')
  const calls = [],
    errors = [],
    timers = []
  let running = game,
    owned = true
  const options = {
    root: '/game',
    sessionId: 'session',
    helperPath: '/helper.exe',
    helperSha256: hash,
    launcherPid: 123,
    command: {
      executable: '/proton',
      args: [
        'runinprefix',
        '/helper.exe',
        '--cosmetic-recovery',
        'Z:\\game',
        'session',
        '0',
        'guard-lease'
      ],
      env: { STEAM_COMPAT_DATA_PATH: '/prefix' }
    }
  }
  const fs = {
    lstat: async () =>
      owned ? { isFile: () => true, isSymbolicLink: () => false, size: 300 } : null,
    realpath: async (p) => p,
    readdir: async () => (running ? ['456'] : []),
    readlink: async () => '/game',
    readFile: async (p) =>
      p === '/helper.exe'
        ? tampered
          ? Buffer.from('unapproved')
          : binary
        : p.endsWith('cmdline')
          ? '/game/hl.exe\0'
          : JSON.stringify({ sessionId: changed ? 'other' : 'session', helperSha256: hash })
  }
  const context = vm.createContext({
    require: (name) =>
      ({
        'node:fs/promises': fs,
        'node:path': path,
        'node:crypto': awaitCrypto,
        'node:child_process': {
          spawn: (...args) => {
            calls.push(args)
            const c = new EventEmitter()
            queueMicrotask(() => c.emit('exit', 0))
            return c
          }
        }
      })[name],
    process: {
      argv: ['node', JSON.stringify(options)],
      kill: () => {
        if (!alive) throw Object.assign(new Error(), { code: 'ESRCH' })
      },
      stdout: { write: () => {} },
      exitCode: 0
    },
    console: { error: (e) => errors.push(e) },
    setTimeout: (fn) => timers.push(fn)
  })
  vm.runInContext(protonRecoveryGuardSource, context)
  const flush = async () => {
    for (let i = 0; i < 25; i++) await new Promise((resolve) => setImmediate(resolve))
  }
  await flush()
  return {
    calls,
    errors,
    context,
    async startGame() {
      running = true
      timers.shift()?.()
      await flush()
    },
    async exitGame() {
      running = false
      timers.shift()?.()
      await flush()
    },
    async stop() {
      owned = false
      timers.shift()?.()
      await flush()
    }
  }
}
const awaitCrypto = await import('node:crypto')

test('keeps Wine idle before launch and during play, then restores after the game exits', async () => {
  const f = await fixture()
  assert.equal(f.calls.length, 0)
  await f.startGame()
  assert.equal(f.calls.length, 0)
  await f.exitGame()
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0][1].at(-1), 'restore')
  assert.equal(f.calls[0][2].shell, false)
  assert.deepEqual(f.errors, [])
})
test('launcher crash before the game starts invokes approved restoration', async () => {
  const f = await fixture({ alive: false })
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0][1].at(-1), 'restore')
})
test('a closed session exits without starting Wine or interfering with a later launch', async () => {
  const f = await fixture()
  await f.stop()
  assert.equal(f.calls.length, 0)
})
test('changed session or helper cannot authorize a deferred recovery command', async () => {
  for (const options of [{ changed: true }, { tampered: true, game: true }]) {
    const f = await fixture(options)
    assert.equal(f.calls.length, 0)
    assert.equal(f.context.process.exitCode, 1)
    assert.equal(f.errors.length, 1)
  }
})
