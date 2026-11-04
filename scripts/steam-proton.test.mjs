/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, symlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { build } from 'esbuild'
import {
  parseSteamVdf,
  resolveSteamProtonRuntime,
  protonRecoveryCommand,
  validateSteamProtonRuntime
} from '../src/main/game/steam-proton.ts'

async function fixture(tool = 'proton_8') {
  const home = await mkdtemp(join(tmpdir(), '16c-proton-'))
  const steam = join(home, '.local/share/Steam'),
    library = join(home, 'Other library')
  const game = join(library, 'steamapps/common/Half-Life')
  const put = async (path, data, mode) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data, { mode })
  }
  await mkdir(game, { recursive: true })
  await put(
    join(steam, 'config/config.vdf'),
    `"InstallConfigStore" { "Software" { "Valve" { "Steam" { "CompatToolMapping" { "10" { "name" "${tool}" } } } } } }`
  )
  await put(
    join(steam, 'steamapps/libraryfolders.vdf'),
    `"libraryfolders" { "0" { "path" "${steam}" } "1" { "path" "${library}" } }`
  )
  const proton = join(steam, 'steamapps/common/Proton 8.0/proton')
  await put(
    proton,
    '#!/bin/sh\nprintf "%s\\n" "$STEAM_COMPAT_DATA_PATH" "$STEAM_COMPAT_CLIENT_INSTALL_PATH" "$SteamAppId" "$@"\n',
    0o700
  )
  await put(join(dirname(proton), 'version'), '1731350438 proton-8.0-5d\n')
  return { home, steam, library, game, proton, put }
}

test('selected Proton uses the correct external-library prefix and preserves arguments without shell execution', async () => {
  const f = await fixture()
  try {
    const runtime = await resolveSteamProtonRuntime(f.game, f.home)
    assert.equal(runtime.protonPath, f.proton)
    assert.equal(runtime.compatibilityDataPath, join(f.library, 'steamapps/compatdata/10'))
    const args = [
      '--cosmetic-recovery',
      'Z:\\Game files',
      'session',
      '0',
      'guard-lease',
      'literal $(command)'
    ]
    const command = protonRecoveryCommand(runtime, '/Helper files/game-inspector.exe', args, {})
    const result = spawnSync(command.executable, command.args, {
      env: command.env,
      encoding: 'utf8'
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(result.stdout.trimEnd().split('\n'), [
      runtime.compatibilityDataPath,
      f.steam,
      '10',
      'runinprefix',
      '/Helper files/game-inspector.exe',
      ...args
    ])
    assert.equal(command.env.WINEPREFIX, undefined)
  } finally {
    await rm(f.home, { recursive: true, force: true })
  }
})

test('native Steam does not inherit a global Proton default', async () => {
  const f = await fixture('')
  try {
    await f.put(
      join(f.steam, 'config/config.vdf'),
      '"InstallConfigStore" { "Software" { "Valve" { "Steam" { "CompatToolMapping" { "0" { "name" "proton_8" } } } } } }'
    )
    assert.equal(await resolveSteamProtonRuntime(f.game, f.home), null)
  } finally {
    await rm(f.home, { recursive: true, force: true })
  }
})

test('custom Proton selection reads its metadata instead of probing every installed runtime', async () => {
  const f = await fixture('GE-Proton11-3')
  try {
    const folder = join(f.steam, 'compatibilitytools.d/GE-Proton11-3')
    await f.put(
      join(folder, 'compatibilitytool.vdf'),
      '// comment\n"compatibilitytools" { "compat_tools" { "GE-Proton11-3" { "install_path" "." } } }'
    )
    await f.put(join(folder, 'proton'), '#!/bin/sh\nexit 99\n', 0o700)
    const runtime = await resolveSteamProtonRuntime(f.game, f.home)
    assert.equal(runtime.protonPath, join(folder, 'proton'))
    await f.put(
      join(folder, 'compatibilitytool.vdf'),
      '"compatibilitytools" { "compat_tools" { "GE-Proton11-3" { "install_path" "../elsewhere" } } }'
    )
    await assert.rejects(
      resolveSteamProtonRuntime(f.game, f.home),
      /match.proton.runtimeUnavailable/
    )
  } finally {
    await rm(f.home, { recursive: true, force: true })
  }
})

test('metadata parsing preserves escaped values and rejects truncated or excessively deep data', () => {
  const parsed = parseSteamVdf('"root" { "path" "C:\\\\Steam" "text" "a \\"quote\\"" }')
  assert.equal(parsed.root.path, 'C:\\Steam')
  assert.equal(parsed.root.text, 'a "quote"')
  assert.throws(() => parseSteamVdf('"root" { "name" "x"'))
  assert.throws(() => parseSteamVdf('"a" {'.repeat(34) + '}'.repeat(34)))
  assert.equal(
    validateSteamProtonRuntime({
      protonPath: '/x/proton',
      steamRoot: '/steam',
      compatibilityDataPath: '/steam/steamapps/compatdata/0'
    }),
    false
  )
})

test('Proton recovery context survives launcher updates, is scoped to its session, and rejects symlinks', async () => {
  const f = await fixture()
  try {
    const bundle = await build({
      entryPoints: [
        new URL('../src/main/game/proton-recovery-context.ts', import.meta.url).pathname
      ],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false
    })
    const context = await import(
      'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
    )
    const runtime = await resolveSteamProtonRuntime(f.game, f.home)
    const userData = join(f.home, 'launcher-data')
    await context.saveProtonRecoveryContext(userData, f.game, 'session-a', runtime)
    assert.deepEqual(
      await context.readProtonRecoveryContext(userData, f.game, 'session-a'),
      runtime
    )
    await assert.rejects(
      context.readProtonRecoveryContext(userData, f.game, 'session-b'),
      /does not match/
    )
    const folder = join(userData, 'proton-recovery'),
      path = join(folder, (await readdir(folder))[0])
    const before = await readFile(path, 'utf8')
    await writeFile(path, '{broken')
    await assert.rejects(context.readProtonRecoveryContext(userData, f.game, 'session-a'))
    await writeFile(path, before)
    await context.removeProtonRecoveryContext(userData, f.game)
    await symlink(join(f.home, 'unknown'), path)
    await assert.rejects(
      context.readProtonRecoveryContext(userData, f.game, 'session-a'),
      /Invalid/
    )
    await context.removeProtonRecoveryContext(userData, f.game)
    assert.equal(await context.readProtonRecoveryContext(userData, f.game, 'session-a'), undefined)
  } finally {
    await rm(f.home, { recursive: true, force: true })
  }
})
