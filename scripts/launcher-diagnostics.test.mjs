import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setDefaultMimeHandler } from '../src/main/linux-mimeapps.ts'
import {
  collectGameConsoleLogs,
  collectGameConfigSnapshot,
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
        'password "secret-password"\nsetinfo "_16c" "secret-token"\nBad command character in client command\n'
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
    assert.ok(
      !redactReportLogs('{"joinToken":"private"}\nAuthorization: Bearer private').includes(
        'private'
      )
    )
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

test('config snapshots preserve movement settings and binds while redacting secrets', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-config-report-'))
  try {
    await mkdir(join(directory, 'cstrike'))
    await writeFile(
      join(directory, 'cstrike', 'config.cfg'),
      'fps_max "999"\nfps_override "1"\ncl_cmdrate "101"\nbind "w" "+forward"\npassword "secret"\nsetinfo "_16c" "private-token"\n' +
        '// padding\n'.repeat(5000)
    )
    setGameConsoleDirectory(directory)
    const snapshot = await collectGameConfigSnapshot()
    assert.ok(snapshot.includes('fps_max "999"'))
    assert.ok(snapshot.includes('bind "w" "+forward"'))
    assert.ok(snapshot.includes('cl_cmdrate "101"'))
    assert.ok(!snapshot.includes('secret'))
    assert.ok(!snapshot.includes('private-token'))
    assert.ok(snapshot.includes('truncated'))
    assert.ok(snapshot.length < 33000)
    await rm(join(directory, 'cstrike', 'config.cfg'))
    assert.match(await collectGameConfigSnapshot(), /Not found/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
