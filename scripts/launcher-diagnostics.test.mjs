import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setDefaultMimeHandler } from '../src/main/linux-mimeapps.ts'
import {
  collectGameConsoleLogs,
  setGameConsoleDirectory,
  redactReportLogs
} from '../src/main/game/game-console-logs.ts'
import {
  readMatchLaunchDiagnostics,
  saveMatchLaunchDiagnostics
} from '../src/main/game/match-launch-diagnostics.ts'

test('connection rejection categories survive redaction without leaking accompanying secrets', () => {
  const logs = redactReportLogs(
    'No password set. Clean your userinfo. password secret-one\r\n' +
      'No password set. Clean your user info\n' +
      'Invalid server password secret-two\n' +
      'password secret-three\n' +
      'Info string length exceeded\n' +
      '[1.6 Competitive] Join stage: identity-final\n'
  )
  assert.equal(logs.split('\n')[0], '[Connection diagnostic] missing-server-password')
  assert.equal(logs.split('\n')[1], '[Connection diagnostic] missing-server-password')
  assert.match(logs, /rejected-server-password/)
  assert.ok(!logs.includes('secret-'))
  assert.match(logs, /Info string length exceeded/)
  assert.match(logs, /Join stage: identity-final/)
  assert.equal(redactReportLogs(logs), logs)
})

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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const launchContext = (matchId) => ({
  matchId,
  preparedAt: '2026-10-06T19:07:33.000Z',
  clientVersion: '2026.1006.5',
  helperVersion: '0.1.40',
  platform: 'win32',
  endpoint: '127.0.0.1:27015',
  tokenFingerprint: 'c14104d3d89b',
  handoff: 'native-nextclient',
  distribution: 'nextclient'
})

test('delayed reports retain the launch version and fingerprint without storing credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-launch-context-'))
  try {
    await saveMatchLaunchDiagnostics(directory, {
      ...launchContext('prior-match'),
      joinToken: 'never-persist-this-token',
      password: 'never-persist-this-password'
    })
    const disk = await readFile(join(directory, 'match-prior-match.json'), 'utf8')
    assert.ok(!disk.includes('never-persist'))
    // This reader has no process/session state and can run after a launcher update.
    const report = await readMatchLaunchDiagnostics(directory, 'prior-match')
    assert.match(report, /2026\.1006\.5/)
    assert.match(report, /c14104d3d89b/)
    assert.match(report, /2026-10-06T19:07:33/)
    await saveMatchLaunchDiagnostics(directory, {
      ...launchContext('standard-launch'),
      handoff: 'startup-exec'
    })
    assert.match(await readMatchLaunchDiagnostics(directory, 'standard-launch'), /startup-exec/)
    assert.match(
      await readMatchLaunchDiagnostics(directory, 'missing'),
      /reporting client version may differ/
    )
    for (let i = 0; i < 22; i++) {
      await saveMatchLaunchDiagnostics(directory, launchContext(`new-${i}`))
    }
    assert.equal((await readdir(directory)).length, 20)
    assert.match(await readMatchLaunchDiagnostics(directory, 'new-21'), /c14104d3d89b/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('launch reports reject traversal, oversized files, wrong matches and symlinks', async () => {
  const directory = await mkdtemp(join(tmpdir(), '16c-launch-context-invalid-'))
  try {
    await assert.rejects(saveMatchLaunchDiagnostics(directory, launchContext('../outside')))
    await assert.rejects(readMatchLaunchDiagnostics(directory, '../outside'))
    await writeFile(
      join(directory, 'match-mismatch.json'),
      JSON.stringify(launchContext('another'))
    )
    assert.match(await readMatchLaunchDiagnostics(directory, 'mismatch'), /invalid/)
    await writeFile(join(directory, 'match-large.json'), 'x'.repeat(5000))
    assert.match(await readMatchLaunchDiagnostics(directory, 'large'), /invalid/)
    await writeFile(join(directory, 'match-bad.json'), '{broken json')
    assert.match(await readMatchLaunchDiagnostics(directory, 'bad'), /invalid/)
    if (process.platform !== 'win32') {
      await writeFile(join(directory, 'private.txt'), 'private text')
      await symlink(join(directory, 'private.txt'), join(directory, 'match-linked.json'))
      const report = await readMatchLaunchDiagnostics(directory, 'linked')
      assert.match(report, /invalid/)
      assert.ok(!report.includes('private text'))
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
