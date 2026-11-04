import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnectionErrorMonitor } from '../src/main/game/connection-error-monitor.ts'

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), '16c-console-monitor-'))
  const monitors = []
  const start = async (options = {}) => {
    const monitor = await createConnectionErrorMonitor({
      directory,
      matchId: 'match-one',
      isCurrent: () => true,
      report: async () => {},
      wait: async () => {},
      ...options
    })
    monitors.push(monitor)
    return monitor
  }
  try {
    await run(directory, start)
  } finally {
    for (const monitor of monitors) monitor.stop()
    await rm(directory, { recursive: true, force: true })
  }
}

test('ignores old errors, detects split new output, and reports once without raw credentials', async () =>
  fixture(async (directory, start) => {
    const path = join(directory, 'qconsole.log'),
      calls = []
    await writeFile(path, 'Info string length exceeded\n')
    const monitor = await start({ report: async (...args) => calls.push(args) })
    await monitor.poll()
    assert.equal(calls.length, 0)
    await appendFile(path, 'password private-secret; Info string length ')
    await monitor.poll()
    assert.equal(calls.length, 0)
    await appendFile(path, 'exceeded\n')
    await Promise.all([monitor.poll(), monitor.poll()])
    await appendFile(path, 'Info string length exceeded\n')
    await monitor.poll()
    assert.equal(calls.length, 1)
    assert.equal(calls[0][2], 'game-info-string-overflow:match-one')
    assert.equal(calls[0][3], 'match-one')
    assert.ok(!JSON.stringify(calls).includes('private-secret'))
  }))

test('detects a newly created mod log and retries with the same report key', async () =>
  fixture(async (directory, start) => {
    const calls = []
    const monitor = await start({
      report: async (...args) => {
        calls.push(args)
        if (calls.length < 3) throw new Error('offline')
      }
    })
    await mkdir(join(directory, 'cstrike'))
    await writeFile(join(directory, 'cstrike/qconsole.log'), 'Info string length exceeded\n')
    await monitor.poll()
    assert.equal(calls.length, 3)
    assert.equal(new Set(calls.map((call) => call[2])).size, 1)
  }))

test('detects truncation and file replacement', async () => {
  for (const replace of [false, true])
    await fixture(async (directory, start) => {
      const path = join(directory, 'qconsole.log'),
        calls = []
      await writeFile(path, 'old log\n'.repeat(100))
      const monitor = await start({ report: async (...args) => calls.push(args) })
      if (replace) await rename(path, `${path}.old`)
      await writeFile(path, 'Info string length exceeded\n')
      await monitor.poll()
      assert.equal(calls.length, 1)
    })
})

test('does not report after the account or launch changes', async () =>
  fixture(async (directory, start) => {
    let current = true
    const calls = []
    const monitor = await start({
      isCurrent: () => current,
      report: async (...args) => calls.push(args)
    })
    await writeFile(join(directory, 'qconsole.log'), 'Info string length exceeded\n')
    current = false
    await monitor.poll()
    monitor.stop()
    assert.equal(calls.length, 0)
  }))

test('final exit check catches an error before the next timer tick', async () =>
  fixture(async (directory, start) => {
    let submitted
    const done = new Promise((resolve) => {
      submitted = resolve
    })
    const monitor = await start({ report: async () => submitted() })
    await writeFile(join(directory, 'qconsole.log'), 'Info string length exceeded\n')
    monitor.stop()
    await done
  }))
