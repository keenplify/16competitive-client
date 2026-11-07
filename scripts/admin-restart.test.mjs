import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = await mkdtemp(join(tmpdir(), '16c-admin-restart-'))
after(() => rm(root, { recursive: true, force: true }))
const output = join(root, 'restart.mjs')
let quits = 0
globalThis.adminRestartApp = { quit: () => quits++ }
after(() => delete globalThis.adminRestartApp)
await build({
  entryPoints: ['src/main/game/admin-restart.ts'],
  outfile: output,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
  plugins: [
    {
      name: 'electron',
      setup(builder) {
        builder.onResolve({ filter: /^electron$/ }, () => ({
          path: 'electron',
          namespace: 'fixture'
        }))
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: 'export const app = globalThis.adminRestartApp'
        }))
      }
    }
  ]
})
const { requestAdminRestart } = await import(pathToFileURL(output))
const helper = join(root, 'helper')
const captured = join(root, 'request.json')
for (const [response, exit, expected] of [
  [{ protocol: 1, event: 'admin-approved' }, 0, null],
  [{ protocol: 1, event: 'error', code: 'ADMIN_RESTART_CANCELLED' }, 1, 'adminCancelled'],
  [{ protocol: 1, event: 'error', code: 'ADMIN_RESTART_FAILED' }, 1, 'adminFailed'],
  [{ protocol: 2, event: 'admin-approved' }, 0, 'adminFailed'],
  [{ protocol: 1, event: 'admin-approved' }, 1, 'adminFailed'],
  ['broken frame', 0, 'adminFailed']
]) {
  test(
    `administrator restart ${JSON.stringify(response)} exit ${exit}`,
    { skip: process.platform === 'win32' },
    async () => {
      quits = 0
      await writeFile(
        helper,
        `#!/usr/bin/env node
const fs = require('fs'); let input='';
process.stdin.on('data',bytes=>input+=bytes);
process.stdin.on('end',()=>{
 fs.writeFileSync(${JSON.stringify(captured)},JSON.stringify({argv:process.argv.slice(2),request:JSON.parse(input)}));
 console.log(${JSON.stringify(JSON.stringify(response))});process.exitCode=${exit};
});\n`,
        { mode: 0o700 }
      )
      const operation = requestAdminRestart(
        helper,
        'C:\\Games\\1.6 Competitive.exe',
        'a'.repeat(64)
      )
      if (expected) await assert.rejects(operation, new RegExp(`match\\.launch\\.${expected}`))
      else await operation
      assert.equal(quits, expected ? 0 : 1)
      assert.deepEqual(JSON.parse(await readFile(captured, 'utf8')), {
        argv: ['--request-admin-restart'],
        request: {
          parentPid: process.pid,
          reopen: {
            executable: 'C:\\Games\\1.6 Competitive.exe',
            sha256: 'a'.repeat(64),
            args: ['--return-from-game', '--admin-game-retry']
          }
        }
      })
    }
  )
}
