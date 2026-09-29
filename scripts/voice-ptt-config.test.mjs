import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/main/game/voice-ptt.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false
})
const { prepareVoicePtt } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

test('temporary voice bindings preserve unrelated game settings', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-voice-config-'))
  const gameDirectory = join(directory, 'cstrike')
  const configPath = join(gameDirectory, 'config.cfg')
  const original = 'hud_fastswitch "1"\nsensitivity "2"\nbind "k" "+voicerecord"\n'
  try {
    await mkdir(gameDirectory)
    await writeFile(configPath, original)
    const session = await prepareVoicePtt(gameDirectory)
    assert.match(await readFile(configPath, 'utf8'), /hud_fastswitch "1"/)
    await session.restoreBindings()
    assert.match(await readFile(configPath, 'utf8'), /hud_fastswitch "1"/)
    assert.match(await readFile(configPath, 'utf8'), /sensitivity "2"/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('missing game config is not replaced by a voice-only config', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-voice-config-'))
  const gameDirectory = join(directory, 'cstrike')
  const configPath = join(gameDirectory, 'config.cfg')
  try {
    await mkdir(gameDirectory)
    const session = await prepareVoicePtt(gameDirectory)
    await assert.rejects(readFile(configPath, 'utf8'), { code: 'ENOENT' })
    await session.restoreBindings()
    await assert.rejects(readFile(configPath, 'utf8'), { code: 'ENOENT' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('Windows leaves config unchanged before launch and removes saved temporary binds after exit', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-voice-config-'))
  const gameDirectory = join(directory, 'cstrike')
  const configPath = join(gameDirectory, 'config.cfg')
  const original = 'hud_fastswitch "1"\nbind "k" "+voicerecord"\n'
  try {
    await mkdir(gameDirectory)
    await writeFile(configPath, original)
    const session = await prepareVoicePtt(gameDirectory, undefined, 'K|V', 'win32')
    assert.equal(await readFile(configPath, 'utf8'), original)
    assert.ok(session.configCommands.some((command) => command.includes('+16competitive_team_voice')))
    assert.ok(session.configCommands.some((command) => command.includes('+16competitive_party_voice')))

    // GoldSrc can save the temporary match bindings when it exits.
    await writeFile(
      configPath,
      'hud_fastswitch "1"\nbind "k" "+16competitive_team_voice"\nbind "v" "+16competitive_party_voice"\n'
    )
    await session.restoreBindings()
    const restored = await readFile(configPath, 'utf8')
    assert.match(restored, /hud_fastswitch "1"/)
    assert.match(restored, /bind "k" "\+voicerecord"/)
    assert.doesNotMatch(restored, /16competitive_(?:team|party)_voice/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
