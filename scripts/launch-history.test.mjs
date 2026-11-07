/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
const root = await mkdtemp(join(tmpdir(), '16c-launch-history-'))
after(() => rm(root, { recursive: true, force: true }))
const module = join(root, 'history.mjs')
await build({
  entryPoints: ['src/main/launch-history.ts'],
  outfile: module,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent'
})
const { LaunchHistory } = await import(pathToFileURL(module))
const fileName = (owner) => createHash('sha256').update(owner).digest('hex') + '.json'
const trace = (directory, version = '2026.1107.7', now = Date.now) =>
  new LaunchHistory(
    () => directory,
    () => version,
    now
  )
const parsed = async (history) => JSON.parse(await history.report())

test('restart preserves queue, connect, preparation and helper failure across launcher runs without credentials', async () => {
  const dir = join(root, 'restart')
  const first = trace(dir, '2026.1107.6')
  first.setOwner('player-one')
  first.record('send_attempt', { type: 'join_queue', mode: '5v5', password: 'secret-password' })
  first.record('socket_received', {
    type: 'match_connect',
    matchId: 'match-one',
    password: 'secret-password',
    joinToken: 'private-token',
    hostApiUrl: 'https://user:private-password@node.example.test/path?token=secret'
  })
  first.record('launch_requested', {
    type: 'game_process_launch',
    matchId: 'match-one',
    attemptId: 'attempt-one'
  })
  first.record('preparation_progress', {
    type: 'game_process_preparation',
    phase: 'starting',
    matchId: 'match-one'
  })
  first.record('helper_failed', {
    type: 'game_process_error',
    matchId: 'match-one',
    code: 'GAME_SPAWN_FAILED',
    osError: 740,
    elevated: false
  })
  await first.flush()
  const second = trace(dir)
  second.setOwner('player-one')
  // Exercise recording during the asynchronous read of the previous run.
  second.record('socket_received', { type: 'authenticated' })
  const report = await parsed(second)
  assert.deepEqual(
    report.timeline.map((x) => x.data.type),
    [
      'join_queue',
      'match_connect',
      'game_process_launch',
      'game_process_preparation',
      'game_process_error',
      'authenticated'
    ]
  )
  assert.notEqual(report.timeline[0].runId, report.currentRunId)
  assert.equal(report.timeline[0].clientVersion, '2026.1107.6')
  assert.equal(report.timeline.at(-1).clientVersion, '2026.1107.7')
  assert.equal(report.timeline[4].data.elevated, false)
  assert.equal(report.timeline[4].data.osError, 740)
  assert.equal(report.timeline[1].data.hostApiUrl, 'https://node.example.test')
  await second.flush()
  const bytes = await readFile(join(dir, fileName('player-one')), 'utf8')
  for (const value of [
    'secret-password',
    'private-token',
    'private-password',
    'player-one',
    '?token='
  ])
    assert.ok(!bytes.includes(value))
})

test('account changes and sign-out cannot include another account history, including queued writes', async () => {
  const history = trace(join(root, 'accounts'))
  history.setOwner('first')
  history.record('launch_requested', { type: 'game_process_launch', matchId: 'first-match' })
  const pendingFirstAccountReport = history.report()
  history.setOwner('second')
  assert.equal(JSON.parse(await pendingFirstAccountReport).reason, 'account_changed')
  history.record('launch_requested', { type: 'game_process_launch', matchId: 'second-match' })
  assert.ok(!(await history.report()).includes('first-match'))
  history.setOwner('first')
  assert.ok((await history.report()).includes('first-match'))
  assert.ok(!(await history.report()).includes('second-match'))
  history.setOwner(null)
  assert.equal((await parsed(history)).reason, 'no_authenticated_account')
  await history.flush()
})

test('repeated connect frames, countdowns, asset progress and queue polling cannot evict a failed launch', async () => {
  const history = trace(join(root, 'noise'))
  history.setOwner('player')
  history.record('helper_failed', {
    type: 'game_process_error',
    code: 'GAME_SPAWN_FAILED',
    osError: 740
  })
  for (let i = 0; i < 1000; i++) {
    history.record('socket_received', { type: 'match_connect', matchId: 'same', clockOffsetMs: i })
    history.record('renderer_forward', { type: 'match_connect', matchId: 'same', clockOffsetMs: i })
    history.record('socket_received', { type: 'queue_status', completedFiles: i })
    history.record('socket_received', { type: 'match_countdown', remainingMs: i })
    history.record('socket_received', { type: 'match_assets_progress', completedFiles: i })
  }
  const report = await parsed(history)
  assert.equal(report.timeline.length, 3)
  assert.equal(report.timeline[0].data.osError, 740)
  await history.flush()
})

test('history expires after six hours, bounds event count and retains at most five account files', async () => {
  let now = Date.now()
  const dir = join(root, 'bounds'),
    history = trace(dir, undefined, () => now)
  history.setOwner('player')
  for (let i = 0; i < 500; i++)
    history.record('launch_requested', { type: 'game_process_launch', matchId: `match-${i}` })
  assert.equal((await parsed(history)).timeline.length, 256)
  await history.flush()
  assert.ok((await readFile(join(dir, fileName('player')))).length <= 256 * 1024)
  now += 6 * 60 * 60_000 + 1
  assert.equal((await parsed(history)).timeline.length, 0)
  for (let i = 0; i < 7; i++) {
    history.setOwner(`account-${i}`)
    history.record('launch_requested', { type: 'game_process_launch' })
    await history.flush()
  }
  assert.ok((await readdir(dir)).filter((x) => x.endsWith('.json')).length <= 5)
})

test('modified local files are reprojected and wrong-owner, oversized or symbolic-link files fail closed', async () => {
  const dir = join(root, 'untrusted'),
    history = trace(dir)
  history.setOwner('player')
  history.record('launch_requested', { type: 'game_process_launch' })
  await history.flush()
  const file = join(dir, fileName('player')),
    saved = JSON.parse(await readFile(file, 'utf8'))
  saved.entries[0].data.token = 'local-file-secret'
  saved.entries[0].data.connection = { password: 'private' }
  await writeFile(file, JSON.stringify(saved))
  let loaded = trace(dir)
  loaded.setOwner('player')
  assert.ok(!(await loaded.report()).includes('local-file-secret'))
  await loaded.flush()
  saved.ownerHash = 'wrong-owner'
  await writeFile(file, JSON.stringify(saved))
  loaded = trace(dir)
  loaded.setOwner('player')
  assert.equal((await parsed(loaded)).timeline.length, 0)
  await writeFile(file, 'x'.repeat(256 * 1024 + 1))
  loaded = trace(dir)
  loaded.setOwner('player')
  assert.equal((await parsed(loaded)).timeline.length, 0)
  if (process.platform !== 'win32') {
    const elsewhere = join(root, 'elsewhere')
    await mkdir(elsewhere)
    const linked = join(root, 'linked')
    await symlink(elsewhere, linked)
    loaded = trace(linked)
    loaded.setOwner('player')
    loaded.record('launch_requested', { type: 'game_process_launch' })
    await loaded.flush()
    assert.deepEqual(await readdir(elsewhere), [])
  }
})
