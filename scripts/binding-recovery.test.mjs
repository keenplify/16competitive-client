import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/main/game/binding-recovery.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false
})
const { recoverBrokenBindings, repairBrokenBindings } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
)

test('repairs only a legacy empty bind table and keeps an exact backup', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-bind-recovery-'))
  const configPath = join(directory, 'config.cfg')
  const original = Buffer.from(
    'name "caf\xe9"\r\nunbindall\r\nbind "ESCAPE" "cancelselect"\r\nbind "`" "toggleconsole"\r\n',
    'latin1'
  )
  try {
    await writeFile(configPath, original)
    const result = await repairBrokenBindings(directory)
    assert.equal(result.repaired, true)
    assert.deepEqual(await readFile(result.backupPath), original)
    const repaired = await readFile(configPath)
    assert.equal(
      repaired.subarray(0, original.length - 2).toString('latin1'),
      original.subarray(0, original.length - 2).toString('latin1')
    )
    const text = repaired.toString('latin1')
    assert.match(text, /bind "w" "\+forward"/)
    assert.match(text, /bind "MOUSE1" "\+attack"/)
    assert.match(text, /bind "MWHEELDOWN" "invnext"/)
    assert.equal((text.match(/bind "ESCAPE"/g) ?? []).length, 1)
    assert.equal((await repairBrokenBindings(directory)).repaired, false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('leaves custom binds and external control configs untouched', async () => {
  assert.equal(recoverBrokenBindings('unbindall\nbind "e" "+forward"\n'), null)
  const directory = await mkdtemp(join(tmpdir(), '16c-bind-recovery-'))
  const original = 'unbindall\nbind "ESCAPE" "cancelselect"\nexec userconfig.cfg\n'
  try {
    await writeFile(join(directory, 'config.cfg'), original)
    await writeFile(join(directory, 'userconfig.cfg'), 'bind "e" "+forward"\n')
    assert.equal((await repairBrokenBindings(directory)).repaired, false)
    assert.equal(await readFile(join(directory, 'config.cfg'), 'utf8'), original)
    assert.deepEqual((await readdir(directory)).sort(), ['config.cfg', 'userconfig.cfg'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
