/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  copyFile,
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

async function loadModule(entry) {
  const context = vm.createContext({ Buffer, console, process: { platform: process.platform } })
  const modules = new Map()
  async function load(path) {
    if (modules.has(path)) return modules.get(path)
    const module = new vm.SourceTextModule(
      ts.transpile(await readFile(path, 'utf8'), {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022
      }),
      { context, identifier: path }
    )
    modules.set(path, module)
    await module.link(async (specifier) => {
      if (specifier.endsWith('.json')) {
        const target = resolve(dirname(path), specifier)
        if (modules.has(target)) return modules.get(target)
        const value = JSON.parse(await readFile(target, 'utf8'))
        const json = new vm.SyntheticModule(
          ['default'],
          function () {
            this.setExport('default', value)
          },
          { context }
        )
        modules.set(target, json)
        return json
      }
      if (!specifier.startsWith('node:')) return load(resolve(dirname(path), `${specifier}.ts`))
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
    })
    return module
  }
  const result = await load(resolve(entry))
  await result.evaluate()
  return result.namespace
}

const { cs13Adapter, hasCs13VersionMetadata, cs13ConnectionArgs } = await loadModule(
  'src/main/game/adapters/cs13.ts'
)
const { LegacyGameService } = await loadModule('src/main/game/legacy-game-service.ts')
const { prepareCs13MatchInstallation } = await loadModule(
  'src/main/game/cs13-match-installation.ts'
)
const { parseMatchmakingMapCatalog } = await loadModule('src/shared/matchmaking-map-catalog.ts')
const { CUSTOM_GAME_MODES, isCustomGameMode } = await loadModule('src/shared/custom-games.ts')

test('custom-only 1.3 survives catalog validation even with no map pool', () => {
  assert.equal(isCustomGameMode('cs13_3v3'), true)
  assert.ok(CUSTOM_GAME_MODES.includes('cs13_3v3'))
  const catalog = parseMatchmakingMapCatalog({ maps: [], customModes: ['cs13_3v3'] })
  assert.deepEqual(Array.from(catalog.customModes), ['cs13_3v3'])
  const map = {
    id: 'cs13_de_dust2',
    displayName: 'Dust II (1.3)',
    game: 'cs13',
    previewUrl: null,
    supportedModes: [],
    webModes: [],
    customModes: ['cs13_3v3']
  }
  assert.equal(
    parseMatchmakingMapCatalog({ maps: [map], customModes: ['cs13_3v3'] }).maps[0].id,
    map.id
  )
  assert.deepEqual(Array.from(parseMatchmakingMapCatalog({ maps: [map] }).customModes), [
    'cs13_3v3'
  ])
  assert.deepEqual(
    Array.from(parseMatchmakingMapCatalog({ maps: [], customModes: [] }).customModes),
    []
  )
  assert.deepEqual(
    Array.from(parseMatchmakingMapCatalog({ maps: [], customModes: ['unknown-mode'] }).customModes),
    []
  )
  assert.throws(() => parseMatchmakingMapCatalog({ maps: [{ ...map, customModes: [null] }] }))
})

test('mode renames and future modes cannot disable the entire map catalog', () => {
  const map = {
    id: 'de_dust2',
    displayName: 'Dust II',
    game: 'cs16',
    previewUrl: null,
    feedbackEnabled: true,
    supportedModes: ['5v5', 'unrated', 'arena', 'fight_yard', 'future_mode'],
    webModes: ['unrated', 'arena', 'fight_yard', 'future_mode'],
    customModes: ['unrated', 'arena', 'fight_yard', 'future_mode']
  }
  const input = { maps: [map], customModes: ['arena', 'fight_yard', 'future_mode', 'arena'] }
  const catalog = parseMatchmakingMapCatalog(input)
  assert.equal(catalog.maps[0].feedbackEnabled, true)
  assert.equal(
    parseMatchmakingMapCatalog({ maps: [{ ...map, feedbackEnabled: undefined }] }).maps[0]
      .feedbackEnabled,
    false
  )
  assert.throws(() => parseMatchmakingMapCatalog({ maps: [{ ...map, feedbackEnabled: 'true' }] }))
  assert.deepEqual(Array.from(catalog.maps[0].supportedModes), ['5v5', 'unrated', 'arena'])
  assert.deepEqual(Array.from(catalog.maps[0].webModes), ['unrated', 'arena'])
  assert.deepEqual(Array.from(catalog.maps[0].customModes), ['unrated', 'arena'])
  assert.deepEqual(Array.from(catalog.customModes), ['arena'])
  assert.ok(input.maps[0].supportedModes.includes('fight_yard'))
  assert.deepEqual(Array.from(parseMatchmakingMapCatalog({ maps: [map] }).customModes), [
    'unrated',
    'arena'
  ])
  for (const field of ['supportedModes', 'webModes', 'customModes']) {
    assert.throws(() => parseMatchmakingMapCatalog({ maps: [{ ...map, [field]: [null] }] }))
  }
  assert.throws(() => parseMatchmakingMapCatalog({ maps: [map], customModes: [42] }))
  assert.throws(() => parseMatchmakingMapCatalog({ maps: [{ ...map, id: '../unsafe' }] }))
  assert.throws(() =>
    parseMatchmakingMapCatalog({ maps: [{ ...map, previewUrl: 'javascript:bad' }] })
  )
  assert.throws(() =>
    parseMatchmakingMapCatalog({ maps: [{ ...map, webModes: ['unadvertised'] }] })
  )
})

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), '16c-cs13-'))
  const folder = join(root, 'Counter Strike 1.3')
  await mkdir(join(folder, 'cstrike', 'cl_dlls'), { recursive: true })
  await writeFile(join(folder, 'cstrike', 'liblist.gam'), 'game "Counter-Strike"\nversion "1.3"\n')
  for (const name of ['hl.exe', 'hl_linux'])
    await writeFile(join(folder, name), 'fixture', { mode: 0o755 })
  for (const name of ['client.dll', 'client.so'])
    await writeFile(join(folder, 'cstrike', 'cl_dlls', name), 'fixture')
  try {
    await run({ root, folder })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('version evidence excludes 1.6, missing, commented and conflicting versions', () => {
  assert.equal(hasCs13VersionMetadata('version "1.3" // retail\r\n'), true)
  for (const source of [
    'version "1.6"',
    '',
    '// version "1.3"',
    'version "1.3"\nversion "1.6"',
    'version "1.30"',
    'version "1.3" extra'
  ])
    assert.equal(hasCs13VersionMetadata(source), false)
})

test('prepares the server mod directory from local stock files without overwriting existing assets', () =>
  fixture(async ({ folder }) => {
    await mkdir(join(folder, 'cstrike', 'models'))
    await writeFile(join(folder, 'cstrike', 'models', 'v_ak47.mdl'), 'local stock model')
    await writeFile(join(folder, 'cstrike', 'userconfig.cfg'), 'user-owned')
    await mkdir(join(folder, 'cstrk13', 'models'), { recursive: true })
    await writeFile(join(folder, 'cstrk13', 'models', 'existing.mdl'), 'preserved')
    const selected = await cs13Adapter.validateInstallation(join(folder, 'cstrike'), 'win32')
    const ready = await prepareCs13MatchInstallation(selected, 'win32')
    assert.equal(ready.modDirectory, 'cstrk13')
    assert.equal(
      await readFile(join(ready.gameDirectory, 'models', 'v_ak47.mdl'), 'utf8'),
      'local stock model'
    )
    assert.equal(
      await readFile(join(ready.gameDirectory, 'models', 'existing.mdl'), 'utf8'),
      'preserved'
    )
    await assert.rejects(stat(join(ready.gameDirectory, 'userconfig.cfg')), { code: 'ENOENT' })
    await writeFile(join(ready.gameDirectory, 'models', 'v_ak47.mdl'), 'player change')
    await prepareCs13MatchInstallation(selected, 'win32')
    assert.equal(
      await readFile(join(ready.gameDirectory, 'models', 'v_ak47.mdl'), 'utf8'),
      'player change'
    )
    assert.equal(
      await readFile(join(selected.gameDirectory, 'models', 'v_ak47.mdl'), 'utf8'),
      'local stock model'
    )
  }))

test('refuses a conflicting version or redirected server mod directory', () =>
  fixture(async ({ root, folder }) => {
    const selected = await cs13Adapter.validateInstallation(folder, 'win32')
    const target = join(folder, 'cstrk13')
    await mkdir(target)
    await writeFile(join(target, 'liblist.gam'), 'version "1.6"\n')
    await assert.rejects(prepareCs13MatchInstallation(selected, 'win32'))
    await rm(target, { recursive: true })
    await symlink(root, target, 'dir')
    await assert.rejects(prepareCs13MatchInstallation(selected, 'win32'))
  }))

for (const platform of ['win32', 'linux']) {
  test(
    `${platform}: validates root/subfolder and builds an isolated menu launch`,
    { skip: platform === 'linux' && process.platform === 'win32' },
    () =>
      fixture(async ({ folder }) => {
        const rootResult = await cs13Adapter.validateInstallation(folder, platform)
        const nestedResult = await cs13Adapter.validateInstallation(
          join(folder, 'cstrike'),
          platform
        )
        assert.equal(rootResult.folderPath, nestedResult.folderPath)
        assert.equal(rootResult.game, 'cs13')
        const plan = cs13Adapter.buildMenuLaunchPlan(rootResult)
        assert.equal(plan.executable, join(folder, platform === 'win32' ? 'hl.exe' : 'hl_linux'))
        assert.equal(plan.cwd, folder)
        assert.deepEqual(Array.from(plan.args), [
          ...(platform === 'win32' ? ['-gl', '-nosierra'] : []),
          '-game',
          'cstrike'
        ])
        assert.equal(
          await readFile(join(folder, 'cstrike', 'liblist.gam'), 'utf8'),
          'game "Counter-Strike"\nversion "1.3"\n'
        )
      })
  )
}

test('rejects unsafe paths, unsupported platforms and missing client files', () =>
  fixture(async ({ folder }) => {
    for (const path of [null, {}, 'relative', `${folder}\0`])
      await assert.rejects(cs13Adapter.validateInstallation(path, 'linux'), {
        code: 'invalidInstallation'
      })
    await assert.rejects(cs13Adapter.validateInstallation(folder, 'darwin'), {
      code: 'unsupportedPlatform'
    })
    await rm(join(folder, 'cstrike', 'cl_dlls', 'client.dll'))
    await assert.rejects(cs13Adapter.validateInstallation(folder, 'win32'), {
      code: 'invalidInstallation'
    })
  }))

test(
  'validation never adds Linux execute permissions',
  { skip: process.platform === 'win32' },
  () =>
    fixture(async ({ folder }) => {
      const executable = join(folder, 'hl_linux')
      await chmod(executable, 0o644)
      await assert.rejects(cs13Adapter.validateInstallation(folder, 'linux'), {
        code: 'invalidInstallation'
      })
      assert.equal((await stat(executable)).mode & 0o111, 0)
    })
)

test('Linux can select a Windows 1.3 installation for an explicit Wine launch', () =>
  fixture(async ({ folder }) => {
    await rm(join(folder, 'hl_linux'))
    const installation = await cs13Adapter.validateInstallation(folder, 'linux')
    assert.equal(installation.runtime, 'wine')
    const plan = cs13Adapter.buildMenuLaunchPlan(installation)
    assert.equal(plan.executable, 'wine')
    assert.deepEqual(Array.from(plan.args), [
      join(folder, 'hl.exe'),
      '-gl',
      '-nosierra',
      '-game',
      'cstrike'
    ])
  }))

test('Wine scales the fixed-size WON menu through a private Gamescope desktop', () =>
  fixture(async ({ folder }) => {
    await rm(join(folder, 'hl_linux'))
    const installation = await cs13Adapter.validateInstallation(folder, 'linux')
    const wineDisplay = { gamescopeExecutable: '/usr/bin/gamescope', width: 1920, height: 1080 }
    const plan = cs13Adapter.buildMenuLaunchPlan(installation, { wineDisplay })
    assert.equal(plan.executable, '/usr/bin/gamescope')
    assert.equal(plan.cwd, folder)
    assert.deepEqual(Array.from(plan.args), [
      '-w',
      '1280',
      '-h',
      '960',
      '-W',
      '1920',
      '-H',
      '1080',
      '-f',
      '--',
      'wine',
      'explorer',
      '/desktop=16competitive-cs13,640x480',
      join(folder, 'hl.exe'),
      '-gl',
      '-nosierra',
      '-full',
      '-w',
      '1280',
      '-h',
      '960',
      '-game',
      'cstrike'
    ])
    for (const width of [NaN, Infinity, 0, 1920.5, '1920;anything', 20000])
      assert.throws(() =>
        cs13Adapter.buildMenuLaunchPlan(installation, {
          wineDisplay: { ...wineDisplay, width }
        })
      )
    const native = await cs13Adapter.validateInstallation(folder, 'win32')
    assert.deepEqual(Array.from(cs13Adapter.buildMenuLaunchPlan(native, { wineDisplay }).args), [
      '-gl',
      '-nosierra',
      '-game',
      'cstrike'
    ])
  }))

test('explicit display dimensions reach Windows and Wine without conflicting desktop sizes', () =>
  fixture(async ({ folder }) => {
    const resolution = { width: 1024, height: 768 }
    const native = await cs13Adapter.validateInstallation(folder, 'win32')
    const nativeArgs = cs13Adapter.buildMenuLaunchPlan(native, { resolution }).args
    assert.deepEqual(Array.from(nativeArgs), [
      '-gl',
      '-nosierra',
      '-width',
      '1024',
      '-height',
      '768',
      '-game',
      'cstrike'
    ])
    await rm(join(folder, 'hl_linux'))
    const installation = await cs13Adapter.validateInstallation(folder, 'linux')
    const plan = cs13Adapter.buildMenuLaunchPlan(installation, {
      resolution,
      wineDisplay: { gamescopeExecutable: '/usr/bin/gamescope', width: 1920, height: 1080 }
    })
    assert.ok(plan.args.includes('/desktop=16competitive-cs13,1024x768'))
    assert.deepEqual(Array.from(plan.args).slice(0, 4), ['-w', '1024', '-h', '768'])
    assert.ok(plan.args.includes('-width'))
  }))

test('supports the separate cstrk13 WON community mod directory', () =>
  fixture(async ({ folder }) => {
    const { rename } = await import('node:fs/promises')
    await rename(join(folder, 'cstrike'), join(folder, 'cstrk13'))
    const installation = await cs13Adapter.validateInstallation(join(folder, 'cstrk13'), 'win32')
    assert.equal(installation.modDirectory, 'cstrk13')
    assert.deepEqual(Array.from(cs13Adapter.buildMenuLaunchPlan(installation).args), [
      '-gl',
      '-nosierra',
      '-game',
      'cstrk13'
    ])
  }))

test('rejects version metadata and executables symlinked outside the selected root', () =>
  fixture(async ({ root, folder }) => {
    const external = join(root, 'external')
    await writeFile(external, 'version "1.3"\n', { mode: 0o755 })
    const metadata = join(folder, 'cstrike', 'liblist.gam')
    await rm(metadata)
    await symlink(external, metadata)
    await assert.rejects(cs13Adapter.validateInstallation(folder, 'linux'), {
      code: 'invalidInstallation'
    })
    await rm(metadata)
    await writeFile(metadata, 'version "1.3"\n')
    await rm(join(folder, 'hl_linux'))
    await symlink(external, join(folder, 'hl_linux'))
    await assert.rejects(cs13Adapter.validateInstallation(folder, 'linux'), {
      code: 'invalidInstallation'
    })
  }))

test('bounds metadata reads and rejects a 1.6 installation', () =>
  fixture(async ({ folder }) => {
    for (const content of ['version "1.6"\n', 'version "1.3"\n' + ' '.repeat(16_384)]) {
      await writeFile(join(folder, 'cstrike', 'liblist.gam'), content)
      await assert.rejects(cs13Adapter.validateInstallation(folder, 'linux'), {
        code: 'invalidInstallation'
      })
    }
  }))

test('separate profile survives restart; launch revalidates changed version metadata', () =>
  fixture(async ({ root, folder }) => {
    const settingsPath = join(root, 'launcher', 'cs13-installation.json')
    const cs16Settings = join(root, 'launcher', 'game-settings.json')
    await mkdir(dirname(cs16Settings))
    await writeFile(cs16Settings, '{"cs16ExecutablePath":"existing-1.6"}')
    const launches = []
    const deps = {
      settingsPath,
      platform: process.platform,
      chooseFolder: async () => folder,
      isBusy: () => false,
      launch: async (plan) => {
        launches.push(plan)
      }
    }
    const service = new LegacyGameService(deps)
    assert.equal((await service.get()).value.installation, null)
    assert.equal((await service.launch()).error, 'installationRequired')
    assert.equal((await service.choose()).ok, true)
    const restarted = new LegacyGameService(deps)
    assert.equal((await restarted.get()).value.installation.game, 'cs13')
    assert.equal((await restarted.launch()).ok, true)
    assert.equal(launches.length, 1)
    await writeFile(join(folder, 'cstrike', 'liblist.gam'), 'version "1.6"\n')
    assert.equal((await restarted.launch()).error, 'invalidInstallation')
    assert.equal(launches.length, 1)
    const invalidProfile = (await restarted.get()).value
    assert.equal(invalidProfile.folderPath, folder)
    assert.equal(invalidProfile.installation, null)
    assert.equal(await readFile(cs16Settings, 'utf8'), '{"cs16ExecutablePath":"existing-1.6"}')
  }))

test('busy sessions, cancellation, failed spawn and corrupt settings fail safely', () =>
  fixture(async ({ root, folder }) => {
    const settingsPath = join(root, 'cs13-installation.json')
    let busy = true
    let selection = folder
    const service = new LegacyGameService({
      settingsPath,
      platform: process.platform,
      isBusy: () => busy,
      chooseFolder: async () => selection,
      launch: async () => {
        throw new Error('spawn failed')
      }
    })
    assert.equal((await service.choose()).error, 'busy')
    assert.equal((await service.launch()).error, 'busy')
    busy = false
    selection = null
    assert.equal((await service.choose()).value, null)
    await assert.rejects(stat(settingsPath), { code: 'ENOENT' })
    selection = folder
    assert.equal((await service.choose()).ok, true)
    assert.equal((await service.launch()).error, 'launchFailed')
    await writeFile(settingsPath, '{broken')
    assert.equal((await service.get()).error, 'settingsFailed')
    assert.equal((await service.choose()).ok, true)
  }))

test('serializes selection and launch operations', () =>
  fixture(async ({ root, folder }) => {
    let finishSelection
    const service = new LegacyGameService({
      settingsPath: join(root, 'cs13-installation.json'),
      platform: process.platform,
      isBusy: () => false,
      chooseFolder: () =>
        new Promise((resolve) => {
          finishSelection = resolve
        }),
      launch: async () => {}
    })
    const choosing = service.choose()
    assert.equal((await service.launch()).error, 'busy')
    assert.equal((await service.choose()).error, 'busy')
    finishSelection(folder)
    assert.equal((await choosing).ok, true)
  }))

test('persists the chosen mod when both 1.3 directories exist', () =>
  fixture(async ({ root, folder }) => {
    const { cp } = await import('node:fs/promises')
    await cp(join(folder, 'cstrike'), join(folder, 'cstrk13'), { recursive: true })
    const launches = []
    const deps = {
      settingsPath: join(root, 'cs13-installation.json'),
      platform: 'win32',
      isBusy: () => false,
      chooseFolder: async () => join(folder, 'cstrike'),
      launch: async (plan) => {
        launches.push(plan)
      }
    }
    assert.equal((await new LegacyGameService(deps).choose()).ok, true)
    const restarted = new LegacyGameService(deps)
    assert.equal((await restarted.get()).value.installation.modDirectory, 'cstrike')
    assert.equal((await restarted.launch()).ok, true)
    assert.deepEqual(Array.from(launches[0].args), ['-gl', '-nosierra', '-game', 'cstrike'])
  }))

test('1.3 uses safe startup password and a private post-connect authentication file', async () => {
  const connection = {
    host: '127.0.0.1',
    port: 27015,
    password: 'a'.repeat(24),
    joinToken: '-'.repeat(32)
  }
  assert.deepEqual(Array.from(cs13ConnectionArgs(connection)), [
    '+password',
    connection.password,
    '+connect',
    '127.0.0.1:27015'
  ])
  for (const patch of [
    { password: '-password' },
    { host: 'host;quit' },
    { port: 0 },
    { port: 65536 },
    { joinToken: 'x\nquit' },
    { joinToken: 'a'.repeat(33) }
  ])
    assert.throws(() => cs13ConnectionArgs({ ...connection, ...patch }))
  const { cs13AuthContents, createCs13AuthFile } = await loadModule(
    'src/main/game/cs13-auth-file.ts'
  )
  const { name, contents } = cs13AuthContents(connection)
  assert.match(name, /^16c13_[a-f0-9]{16}\.cfg$/)
  assert.equal(name, '16c13_1e06183733a1ca7d.cfg')
  assert.equal(
    contents,
    '// 1.3 Competitive session authentication\ncmd 16c13_auth 1f953e9c135495daa296900f38bf5b50\n'
  )
  assert.match(contents, /cmd 16c13_auth [a-f0-9]{32}\n$/)
  assert.ok(!contents.includes(connection.joinToken))
  assert.ok(!contents.includes(connection.password))
  const root = await mkdtemp(join(tmpdir(), 'cs13-auth-'))
  try {
    const remove = await createCs13AuthFile(root, connection)
    assert.equal(await readFile(join(root, name), 'utf8'), contents)
    if (process.platform !== 'win32')
      assert.equal((await stat(join(root, name))).mode & 0o777, 0o600)
    const removeReused = await createCs13AuthFile(root, connection)
    await removeReused()
    await remove()
    await writeFile(join(root, name), 'unrecognized player changes')
    await assert.rejects(createCs13AuthFile(root, connection))
    assert.equal(await readFile(join(root, name), 'utf8'), 'unrecognized player changes')
    await assert.rejects(remove())
    assert.equal(await readFile(join(root, name), 'utf8'), 'unrecognized player changes')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('stale 1.1 metadata cannot admit an unknown client DLL', () =>
  fixture(async ({ folder }) => {
    await writeFile(join(folder, 'cstrike', 'liblist.gam'), 'version "1.1"\n')
    await writeFile(join(folder, 'cstrike', 'cl_dlls', 'client.dll'), Buffer.alloc(655360))
    for (const platform of ['win32', 'linux'])
      await assert.rejects(cs13Adapter.validateInstallation(folder, platform), {
        code: 'invalidInstallation'
      })
  }))

// Opt-in local integration: proprietary game binaries are never committed.
// Only these three files are copied; never traverse a player's installation.
for (const platform of ['win32', 'linux']) {
  test(
    `AGC installed build: ${platform} selection, match preparation and revalidation`,
    { skip: !process.env.CS13_AGC_TEST_ROOT },
    () =>
      fixture(async ({ folder }) => {
        const source = process.env.CS13_AGC_TEST_ROOT
        await rm(join(folder, 'hl_linux'))
        for (const name of ['hl.exe', 'cstrike/liblist.gam', 'cstrike/cl_dlls/client.dll'])
          await copyFile(join(source, name), join(folder, name))
        const original = await readFile(join(folder, 'cstrike', 'liblist.gam'), 'utf8')
        const installation = await cs13Adapter.validateInstallation(folder, platform)
        assert.equal(installation.versionEvidence, 'agc-client-sha256')
        assert.equal(installation.runtime, platform === 'linux' ? 'wine' : 'native')
        const prepared = await prepareCs13MatchInstallation(installation, platform)
        assert.equal(prepared.modDirectory, 'cstrk13')
        assert.equal(prepared.versionEvidence, 'agc-client-sha256')
        await prepareCs13MatchInstallation(installation, platform)
        assert.equal(await readFile(join(prepared.gameDirectory, 'liblist.gam'), 'utf8'), original)
        assert.equal(await readFile(join(folder, 'cstrike', 'liblist.gam'), 'utf8'), original)
        await writeFile(join(prepared.gameDirectory, 'cl_dlls', 'client.dll'), Buffer.alloc(655360))
        await assert.rejects(cs13Adapter.validateInstallation(prepared.gameDirectory, platform))
        await assert.rejects(prepareCs13MatchInstallation(installation, platform))
        await writeFile(join(folder, 'cstrike', 'liblist.gam'), 'version "1.6"\n')
        await assert.rejects(cs13Adapter.validateInstallation(join(folder, 'cstrike'), platform))
      })
  )
}
