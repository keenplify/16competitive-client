/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/main/game/voice-ptt.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false
})
const { prepareVoicePtt, goldSrcKeyCode } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
)

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

test('native PTT preserves the complete GoldSrc config and forwards both channels', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-native-ptt-'))
  const cstrike = join(directory, 'cstrike')
  const sessionDirectory = join(directory, 'session')
  const original =
    'unbindall\nbind "w" "+forward"\nbind "k" "+voicerecord"\nbind "v" "impulse 100"\n'
  await mkdir(cstrike)
  await mkdir(sessionDirectory)
  await writeFile(join(cstrike, 'config.cfg'), original)
  const events = []
  const session = prepareVoicePtt((active, channel) => events.push([active, channel]), 'K|V')
  try {
    await session.attachNative(sessionDirectory)
    assert.equal(await readFile(join(sessionDirectory, 'ptt.keys'), 'ascii'), '107 118\n')
    await writeFile(join(sessionDirectory, 'ptt.state'), '1 0\n')
    await pause(100)
    await writeFile(join(sessionDirectory, 'ptt.state'), '1 1\n')
    await pause(100)
    await writeFile(join(sessionDirectory, 'ptt.state'), '0 1\n')
    await pause(100)
    session.stop()
    assert.deepEqual(events, [
      [true, 'team'],
      [true, 'party'],
      [false, 'team'],
      [false, 'party']
    ])
    assert.equal(await readFile(join(cstrike, 'config.cfg'), 'utf8'), original)
  } finally {
    session.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('GoldSrc key codes cover supported keyboard and mouse keys', () => {
  assert.equal(goldSrcKeyCode('K'), 107)
  assert.equal(goldSrcKeyCode('F12'), 146)
  assert.equal(goldSrcKeyCode('MOUSE1'), 241)
  assert.equal(goldSrcKeyCode('MOUSE5'), 245)
  assert.equal(goldSrcKeyCode('CTRL'), 133)
})
