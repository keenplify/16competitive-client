import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/main/game/voice-ptt.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false
})
const { prepareVoicePtt } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
)

test('does not replace GoldSrc first-launch config with voice bindings', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-voice-first-launch-'))
  const cstrike = join(directory, 'cstrike')
  await mkdir(cstrike)
  try {
    const session = await prepareVoicePtt(directory)
    await assert.rejects(stat(join(cstrike, 'config.cfg')), { code: 'ENOENT' })
    assert.equal(session.configCommands.length, 2)
    await writeFile(join(cstrike, 'config.cfg'), 'unbindall\nbind "w" "+forward"\n')
    await session.restoreBindings()
    assert.match(await readFile(join(cstrike, 'config.cfg'), 'utf8'), /bind "w" "\+forward"/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})


test('repairs an existing config that has no gameplay bindings', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-voice-empty-bindings-'))
  const cstrike = join(directory, 'cstrike')
  const configPath = join(cstrike, 'config.cfg')
  await mkdir(cstrike)
  try {
    await writeFile(configPath, 'unbindall\nsensitivity "2.5"\n')
    await prepareVoicePtt(directory, undefined, 'K|V', 'win32')
    const repaired = await readFile(configPath, 'utf8')
    assert.match(repaired, /bind "w" "\+forward"/)
    assert.match(repaired, /bind "a" "\+moveleft"/)
    assert.match(repaired, /bind "s" "\+back"/)
    assert.match(repaired, /bind "d" "\+moveright"/)
    assert.match(repaired, /bind "MOUSE1" "\+attack"/)
    assert.match(repaired, /sensitivity "2\.5"/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('repairs the legacy PTT-only config that made the keyboard menu appear empty', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-voice-ptt-only-'))
  const cstrike = join(directory, 'cstrike')
  const configPath = join(cstrike, 'config.cfg')
  await mkdir(cstrike)
  try {
    await writeFile(
      configPath,
      'bind "k" "+16competitive_team_voice"\nbind "v" "+16competitive_party_voice"\n'
    )
    await prepareVoicePtt(directory, undefined, 'K|V', 'win32')
    const repaired = await readFile(configPath, 'utf8')
    assert.match(repaired, /bind "w" "\+forward"/)
    assert.match(repaired, /bind "a" "\+moveleft"/)
    assert.match(repaired, /bind "k" "\+voicerecord"/)
    assert.doesNotMatch(repaired, /16competitive_(?:team|party)_voice/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('does not reset a valid custom movement layout', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-voice-custom-binds-'))
  const cstrike = join(directory, 'cstrike')
  const configPath = join(cstrike, 'config.cfg')
  await mkdir(cstrike)
  const original =
    'bind "e" "+forward"\nbind "d" "+back"\nbind "s" "+moveleft"\nbind "f" "+moveright"\n'
  try {
    await writeFile(configPath, original)
    await prepareVoicePtt(directory, undefined, 'K|V', 'win32')
    assert.equal(await readFile(configPath, 'utf8'), original)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
