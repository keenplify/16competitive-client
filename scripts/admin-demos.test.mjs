import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
const id = 'abed714b-7416-4318-b4de-ebb21182cd68'
// JavaScript test fixture; TypeScript return annotations are not valid in .mjs.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function fixture(options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'demo-test-'))
  await mkdir(join(directory, 'cstrike'))
  await writeFile(join(directory, 'hl.exe'), '')
  const launched = []
  const requests = []
  const bytes = Buffer.alloc(544)
  bytes.write('HLDEMO')
  const context = vm.createContext({
    Buffer,
    URL,
    AbortSignal,
    Set,
    Promise,
    console,
    fetch: async (url) => {
      requests.push(String(url))
      if (String(url).endsWith('demo-playback-permission'))
        return new Response('{}', { status: options.busy ? 409 : 200 })
      if (String(url).endsWith('/download'))
        return new Response(
          JSON.stringify({
            status: 'READY',
            downloadUrl: options.evil
              ? `https://evil.example/admin/anti-cheat/recordings/${id}/file`
              : `https://api.example/admin/anti-cheat/recordings/${id}/file`
          }),
          { status: options.forbidden ? 403 : 200 }
        )
      return new Response(options.invalid ? 'not a demo' : bytes)
    }
  })
  const mocks = {
    './auth': { getSessionToken: () => 'test-token' },
    './config': { API_BASE_URL: 'https://api.example' },
    './game/game-settings': { getSavedCs16Executable: async () => join(directory, 'hl.exe') },
    './game/cs16-installation': {
      resolveCs16LaunchTarget: async (gameExecutable) => ({
        gameExecutable,
        executable: 'steam',
        argumentPrefix: ['-applaunch', '10', '-game', 'cstrike']
      })
    },
    './matchmaking-regions': { getMatchmakingNodes: async () => [] },
    './matchmaking': { matchmakingConnection: { isBusyForDemo: () => false } },
    'node:child_process': {
      spawn: (...args) => {
        launched.push(args)
        const child = new EventEmitter()
        child.unref = () => {}
        queueMicrotask(() => child.emit('spawn'))
        return child
      }
    }
  }
  const source = ts.transpileModule(await readFile('src/main/admin-demos.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const module = new vm.SourceTextModule(source, { context })
  await module.link(async (specifier) => {
    const exports = mocks[specifier] ?? (await import(specifier))
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
    api: module.namespace,
    launched,
    requests,
    directory,
    cleanup: () => rm(directory, { recursive: true, force: true })
  }
}
test('authorized demo download is validated, placed in cstrike, and passed as a safe argument', async () => {
  const f = await fixture()
  try {
    await f.api.watchAdminDemo(id)
    assert.equal(f.launched.length, 1)
    const args = f.launched[0][1]
    assert.equal(args.at(-2), '+viewdemo')
    assert.match(args.at(-1), /^16c_review_[a-f0-9-]+_[a-f0-9]{8}$/)
    assert.deepEqual(await readdir(join(f.directory, 'cstrike')), [args.at(-1) + '.dem'])
  } finally {
    await f.cleanup()
  }
})
test('denies busy accounts, forbidden recordings, foreign download origins, and invalid demo files', async () => {
  for (const options of [{ busy: true }, { forbidden: true }, { evil: true }, { invalid: true }]) {
    const f = await fixture(options)
    try {
      await assert.rejects(f.api.watchAdminDemo(id))
      assert.equal(f.launched.length, 0)
      assert.deepEqual(await readdir(join(f.directory, 'cstrike')), [])
      assert.equal(
        f.requests.some((url) => url.startsWith('https://evil.example')),
        false
      )
    } finally {
      await f.cleanup()
    }
  }
})
