import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cs13MissingBindingCommands, prepareCs13Controls } from '../src/main/game/cs13-controls.ts'

test('only confirmed unbound keys receive fixed classic controls', () => {
  assert.deepEqual(
    cs13MissingBindingCommands(
      '"w" = "+back"\n"b" is not bound\r\n"SPACE" is not bound\n"unknown;quit" is not bound\n'
    ),
    ['bind "SPACE" "+jump"', 'bind "b" "buy"']
  )
  assert.deepEqual(cs13MissingBindingCommands('"b" = "custom_buy"\n'), [])
})

test('live binding repair ignores old logs, preserves custom commands and cleans its own files', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-controls-'))
  const controls = await prepareCs13Controls(root)
  try {
    const query = await readFile(join(root, controls.probeName), 'utf8')
    const begin = query.match(/echo (16c_controls_begin_[a-f0-9]+)/)[1]
    const end = query.match(/echo (16c_controls_end_[a-f0-9]+)/)[1]
    await writeFile(join(root, 'qconsole.log'), 'old log\n"w" is not bound\n')
    controls.start()
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.ok(!(await readFile(join(root, controls.applyName), 'utf8')).includes('bind "w"'))
    await writeFile(
      join(root, 'qconsole.log'),
      `${begin}\n"w" = "+back"\n"b" is not bound\n${end}\n`
    )
    let applied = ''
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      applied = await readFile(join(root, controls.applyName), 'utf8')
      if (applied.includes('bind "b"')) break
    }
    assert.match(applied, /bind "b" "buy"/)
    assert.ok(!applied.includes('bind "w"'))
  } finally {
    await controls.cleanup()
    assert.deepEqual(await readdir(root), ['qconsole.log'])
    await rm(root, { recursive: true, force: true })
  }
})
