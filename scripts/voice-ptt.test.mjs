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
