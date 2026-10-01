import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildSteamScoreboardWrapper } from '../src/main/game/steam-scoreboard-wrapper.ts'

test('Steam wrapper replaces stale cosmetic preloads but keeps other libraries', () => {
  const root = mkdtempSync(join(tmpdir(), 'scoreboard-wrapper-'))
  try {
    const session = join(root, 'session')
    const module = join(root, 'papamo-cosmetic-module-linux-x86.so')
    const wrapper = join(root, 'wrapper.sh')
    mkdirSync(session)
    writeFileSync(join(session, 'overlay.enabled'), '1\n')
    writeFileSync(module, '')
    writeFileSync(wrapper, buildSteamScoreboardWrapper(session, module), { mode: 0o700 })
    const result = spawnSync(wrapper, ['/bin/sh', '-c', 'printf "%s\n%s\n" "$LD_PRELOAD" "$PAPAMO_SKIN_PROBE_SESSION"'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        LD_PRELOAD: '/old/papamo-cosmetic-module-linux-x86.so:/other/gameoverlayrenderer.so'
      }
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, `${module} /other/gameoverlayrenderer.so\n${session}\n`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
