import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setDefaultMimeHandler } from '../src/main/linux-mimeapps.ts'
import {
  collectGameConsoleLogs,
  setGameConsoleDirectory,
  redactReportLogs
} from '../src/main/game/game-console-logs.ts'

test('MIME registration preserves unrelated defaults and replaces only demo handlers', () => {
  const previous =
    '[Default Applications]\ntext/plain=editor.desktop;\nx-scheme-handler/competitive16=old.desktop;\n[Added Associations]\nimage/png=view.desktop;\n'
  const updated = setDefaultMimeHandler(previous, 'x-scheme-handler/competitive16', 'new.desktop')
  assert.ok(updated.includes('text/plain=editor.desktop;'))
  assert.ok(updated.includes('[Added Associations]\nimage/png=view.desktop;'))
  assert.ok(!updated.includes('old.desktop'))
  assert.equal(
    setDefaultMimeHandler(updated, 'x-scheme-handler/competitive16', 'new.desktop'),
    updated
  )
  assert.ok(
    setDefaultMimeHandler(
      '[Added Associations]\ntext/plain=editor.desktop;\n',
      'x-scheme-handler/competitive16',
      'new.desktop'
    ).includes('[Default Applications]\nx-scheme-handler/competitive16=new.desktop;')
  )
})

test('reports include bounded console tails after exit with credentials removed', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-console-report-'))
  try {
    await mkdir(join(directory, 'cstrike'))
    await writeFile(
      join(directory, 'qconsole.log'),
      'old line\n'.repeat(20000) +
        'password "secret-password"\nsetinfo "_16c" "secret-token"\nsetinfo "_16c_0123456789abcdef" "new-secret-token"\nBad command character in client command\n'
    )
    await writeFile(
      join(directory, 'cstrike', 'qconsole.log'),
      'Banned for move commands flooding (Avg)\n'
    )
    setGameConsoleDirectory(directory)
    const logs = await collectGameConsoleLogs()
    assert.ok(logs.includes('Bad command character'))
    assert.ok(logs.includes('Banned for move commands'))
    assert.ok(logs.length < 132000)
    assert.ok(!logs.includes('secret-password'))
    assert.ok(!logs.includes('secret-token'))
    assert.ok(!logs.includes('new-secret-token'))
    assert.ok(
      !redactReportLogs('{"joinToken":"private"}\nAuthorization: Bearer private').includes(
        'private'
      )
    )
    assert.match(redactReportLogs('{"tokenFingerprint":"8f9a12b3c4d5"}'), /8f9a12b3c4d5/)
    await rm(join(directory, 'qconsole.log'))
    await rm(join(directory, 'cstrike', 'qconsole.log'))
    assert.match(await collectGameConsoleLogs(), /Not found/)
    if (process.platform !== 'win32') {
      await writeFile(join(directory, 'private.txt'), 'private file')
      await symlink(join(directory, 'private.txt'), join(directory, 'qconsole.log'))
      assert.ok(!(await collectGameConsoleLogs()).includes('private file'))
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
