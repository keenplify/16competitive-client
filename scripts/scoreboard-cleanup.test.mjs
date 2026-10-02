import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ScoreboardCleanupQueue } from '../src/main/game/scoreboard-cleanup.ts'

test('next match cannot create live-session while an old feed or frame write is pending', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nextclient-session-'))
  const directory = join(root, 'live-session')
  const queue = new ScoreboardCleanupQueue()
  let finishOldWrite
  const oldWrite = new Promise((resolve) => {
    finishOldWrite = resolve
  })
  let newMatchStarted = false
  try {
    await mkdir(directory)
    queue.enqueue(async () => {
      await oldWrite
      await writeFile(join(directory, 'overlay.png'), 'old frame')
      await rm(directory, { recursive: true })
    })
    const nextMatch = (async () => {
      await queue.wait()
      await mkdir(directory)
      await writeFile(join(directory, 'overlay.png'), 'new frame')
      newMatchStarted = true
    })()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(newMatchStarted, false)
    finishOldWrite()
    await nextMatch
    assert.equal(await readFile(join(directory, 'overlay.png'), 'utf8'), 'new frame')
  } finally {
    finishOldWrite()
    await rm(root, { recursive: true, force: true })
  }
})

test('cleanup stays ordered across sessions and installation types', async () => {
  const queue = new ScoreboardCleanupQueue()
  const order = []
  queue.enqueue(async () => {
    order.push('NextClient')
  })
  queue.enqueue(async () => {
    order.push('GoldSrc')
  })
  await queue.wait()
  assert.deepEqual(order, ['NextClient', 'GoldSrc'])
})

test('failed restoration prevents that launch but permits a later recovery attempt', async () => {
  const queue = new ScoreboardCleanupQueue()
  queue.enqueue(async () => {
    throw new Error('DLL still open')
  })
  await assert.rejects(queue.wait(), /DLL still open/)
  queue.enqueue(async () => {})
  await queue.wait()
})
