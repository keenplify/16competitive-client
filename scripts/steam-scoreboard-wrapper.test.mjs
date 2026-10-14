import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildSteamScoreboardWrapper } from '../src/main/game/steam-scoreboard-wrapper.ts'

test('Steam wrapper loads cosmetics only at the game command and preserves arguments', () => {
  const root = mkdtempSync(join(tmpdir(), 'scoreboard-wrapper-'))
  try {
    const session = join(root, 'session')
    const module = join(root, 'papamo-cosmetic-module-linux-x86.so')
    const wrapper = join(root, 'wrapper.sh')
    const helper = join(root, 'steam-helper.sh')
    const game = join(root, 'hl.sh')
    writeFileSync(helper, '#!/bin/sh\nprintf "helper:%s\\n" "$LD_PRELOAD"\nshift\nexec "$@"\n', {
      mode: 0o700
    })
    writeFileSync(
      game,
      '#!/bin/sh\nprintf "%s\\n%s\\n%s\\n" "$LD_PRELOAD" "$PAPAMO_SKIN_PROBE_SESSION" "$1"\n',
      { mode: 0o700 }
    )
    mkdirSync(session)
    writeFileSync(join(session, 'overlay.enabled'), '1\n')
    writeFileSync(module, '')
    writeFileSync(wrapper, buildSteamScoreboardWrapper(session, module), { mode: 0o700 })
    const result = spawnSync(wrapper, [helper, '--', game, 'argument with spaces'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        LD_PRELOAD:
          '/old/papamo-cosmetic-module-linux-x86.so:/other/gameoverlayrenderer.so:/steam/ubuntu12_32/gameoverlayrenderer.so:/steam/ubuntu12_64/gameoverlayrenderer.so'
      }
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(
      result.stdout,
      `helper:/other/gameoverlayrenderer.so /steam/ubuntu12_32/gameoverlayrenderer.so /steam/ubuntu12_64/gameoverlayrenderer.so\n${module} /other/gameoverlayrenderer.so\n${session}\nargument with spaces\n`
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Steam wrapper preserves unknown commands and inactive sessions', () => {
  const root = mkdtempSync(join(tmpdir(), 'scoreboard-wrapper-'))
  try {
    const module = join(root, 'papamo-cosmetic-module-linux-x86.so')
    const wrapper = join(root, 'wrapper.sh')
    writeFileSync(module, '')
    writeFileSync(wrapper, buildSteamScoreboardWrapper(root, module), { mode: 0o700 })
    for (const active of [false, true]) {
      if (active) writeFileSync(join(root, 'overlay.enabled'), '1\n')
      const result = spawnSync(wrapper, ['/bin/sh', '-c', 'printf "%s" "$LD_PRELOAD"'], {
        encoding: 'utf8',
        env: { ...process.env, LD_PRELOAD: '/other/library.so' }
      })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.stdout, '/other/library.so')
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
