/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { prepareMatchStartupBridge } from '../src/main/game/match-startup-bridge.ts'
import { matchConfigLaunchArgs, matchJoinLaunchArgs } from '../src/main/game/match-join-info-key.ts'

async function loadAdapter(platform) {
  const context = vm.createContext({ process: { platform, env: {} }, Buffer, console })
  const modules = new Map()
  async function load(path) {
    if (modules.has(path)) return modules.get(path)
    const source = await readFile(path, 'utf8')
    const module = new vm.SourceTextModule(ts.transpile(source, { module: ts.ModuleKind.ESNext }), {
      context,
      identifier: path
    })
    modules.set(path, module)
    await module.link(async (specifier) => {
      if (specifier.startsWith('node:')) {
        if (modules.has(specifier)) return modules.get(specifier)
        const namespace = await import(specifier)
        const native = new vm.SyntheticModule(
          Object.keys(namespace),
          function () {
            for (const [name, value] of Object.entries(namespace)) this.setExport(name, value)
          },
          { context }
        )
        modules.set(specifier, native)
        return native
      }
      return load(resolve(dirname(path), `${specifier}.ts`))
    })
    return module
  }
  const adapter = await load(resolve('src/main/game/cs16-installation.ts'))
  await adapter.evaluate()
  return adapter.namespace
}

test('WarzOnE retains its wrapper flags and existing startup script', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-warzone-'))
  try {
    const game = join(root, 'cstrike')
    await mkdir(game)
    await writeFile(join(root, 'hl.exe'), '')
    await writeFile(join(game, 'valve.rc'), 'player startup\n')
    const adapter = await loadAdapter('win32')
    const target = await adapter.resolveCs16LaunchTarget(join(root, 'CS16Launcher.exe'))
    assert.equal(target.usesLauncherHandoff, true)
    assert.equal(target.gameExecutable, join(root, 'hl.exe'))
    assert.equal(target.usesSteamEmulation, true)
    assert.deepEqual(Array.from(target.argumentPrefix), [
      '-steam',
      '-game',
      'cstrike',
      '-noforcemparms',
      '-noforcemaccel'
    ])
    const bridge = await prepareMatchStartupBridge(game, {
      distribution: target.distribution,
      nextClient: false
    })
    assert.equal(bridge.installed, false)
    await bridge.restore()
    assert.equal(await readFile(join(game, 'valve.rc'), 'utf8'), 'player startup\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Steam Windows and Linux keep Steam handoff and never receive a startup bridge', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-steam-'))
  try {
    const directory = join(root, 'steamapps', 'common', 'Half-Life')
    const game = join(directory, 'cstrike')
    await mkdir(game, { recursive: true })
    await writeFile(join(root, 'steam.exe'), '')
    for (const platform of ['win32', 'linux']) {
      const adapter = await loadAdapter(platform)
      const target = await adapter.resolveCs16LaunchTarget(
        join(directory, platform === 'win32' ? 'hl.exe' : 'hl_linux')
      )
      assert.equal(target.distribution, 'steam')
      assert.equal(target.usesLauncherHandoff, true)
      assert.equal(target.executable, platform === 'win32' ? join(root, 'steam.exe') : 'steam')
      assert.deepEqual(Array.from(target.argumentPrefix).slice(0, 4), [
        '-applaunch',
        '10',
        '-game',
        'cstrike'
      ])
      assert.equal(
        (
          await prepareMatchStartupBridge(game, {
            distribution: target.distribution,
            nextClient: false
          })
        ).installed,
        false
      )
      await assert.rejects(stat(join(game, 'valve.rc')), { code: 'ENOENT' })
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('NextClient preserves native identity and never receives startup exec or bridge', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-nextclient-launch-'))
  try {
    const game = join(root, 'cstrike')
    await mkdir(game)
    await writeFile(join(root, 'rev.ini'), '[Emulator]\n')
    const adapter = await loadAdapter('win32')
    const target = await adapter.resolveCs16LaunchTarget(join(root, 'cstrike.exe'))
    assert.equal(target.distribution, 'standalone')
    assert.equal(target.executable, join(root, 'cstrike.exe'))
    assert.deepEqual(matchConfigLaunchArgs('16competitive_match.cfg', true), [])
    assert.deepEqual(matchJoinLaunchArgs('match', 'a'.repeat(32), 'native-nextclient'), [])
    assert.equal(
      (
        await prepareMatchStartupBridge(game, {
          distribution: target.distribution,
          nextClient: true
        })
      ).installed,
      false
    )
    await assert.rejects(stat(join(game, 'valve.rc')), { code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
