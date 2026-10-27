/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import net from 'node:net'
import { randomBytes, createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, readdir, rm, readFile, copyFile, readlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const enabled = process.env.NATIVE_HELPER_RUNTIME_TEST === '1'
const matchId = '12345678-1234-4234-8234-123456789abc'
const token = 'runtime-fixture-session-token-abcdefghijklmnopqrstuvwxyz'
test(
  'background runtime validates device status and shares the managed game integrations',
  { skip: !enabled, timeout: 180_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), '16c-runtime-test-'))
    const routes = new Set()
    let banned = false
    let finished = false
    let kills = 0
    const server = createServer(async (req, res) => {
      const path = new URL(req.url, 'http://localhost').pathname
      routes.add(path)
      req.resume()
      res.setHeader('content-type', 'application/json')
      let body = { accepted: true }
      if (path === '/auth/anti-cheat/device-status')
        body = banned
          ? {
              banned: true,
              permanent: true,
              offenseCount: 1,
              expiresAt: null,
              displayUntil: '2099-01-01',
              reason: 'fixture',
              appealEmail: 'fixture@example.test'
            }
          : { banned: false }
      else if (path === '/auth/session')
        body = {
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          player: {
            id: 'fixture-player',
            username: 'fixture_player',
            email: null,
            mmr: 1000,
            points: 0,
            flagCountryCode: null,
            createdAt: '2026-01-01T00:00:00Z',
            hasPassword: false
          }
        }
      else if (path === '/auth/crosshair') body = { profile: null }
      else if (path.endsWith('/helper-connection')) {
        if (finished) res.statusCode = 404
        body = {
          matchId,
          mode: '3v3',
          host: process.env.NATIVE_HELPER_GAME_HOST || '127.0.0.1',
          port: Number(process.env.NATIVE_HELPER_GAME_PORT || 27099),
          password: '',
          joinToken: 'a'.repeat(32),
          playerName: 'fixture_player'
        }
      } else if (path.endsWith('/assets')) body = { assets: [] }
      else if (path.endsWith('/live-scoreboard')) {
        res.setHeader('content-type', 'text/plain')
        res.end(
          `#16c-scoreboard-v16\tde_dust2\t1\t0\t\t12\t13\t0\t0\t1\t1400\t1400\t3\t0\t\t1\n1\t2\t${kills}\t0\t0\t30\t1\t0\t800\t0\t100\t0\t0\t0\t0\tfixture_player\n2\t1\t0\t0\t0\t35\t1\t0\t800\t0\t100\t0\t0\t0\t0\topponent\n`
        )
        return
      }
      res.end(JSON.stringify(body))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const apiOrigin = `http://127.0.0.1:${server.address().port}`
    const electron =
      process.env.NATIVE_HELPER_RUNTIME_EXE || createRequire(import.meta.url)('electron')
    const processes = new Set()
    const cleanFixtureLinks = async () => {
      const gameRoot = process.env.NATIVE_HELPER_GAME_ROOT
      if (!gameRoot) return
      for (const name of ['models', 'sound', 'sprites']) {
        const path = join(gameRoot, 'cstrike', name, '16competitive')
        const target = await readlink(path).catch(() => null)
        if (target?.includes('16c-runtime-test-')) await rm(path, { recursive: true, force: true })
      }
    }
    async function run(action, extra = {}) {
      const capability = randomBytes(32).toString('hex')
      const control = net.createServer()
      await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve))
      let output = '',
        errors = ''
      control.on('connection', (socket) => {
        socket.on('error', () => {
          /* The runtime may close during a rejected request. */
        })
        let hello = ''
        const authenticate = (b) => {
          hello += b.toString()
          if (!hello.includes('\n')) return
          const greeting = JSON.parse(hello.trim())
          assert.equal(greeting.capability, capability)
          socket.removeListener('data', authenticate)
          socket.on('data', (b) => {
            output += b.toString()
          })
          socket.write(
            JSON.stringify({ protocol: 1, action, apiOrigin, token, matchId, ...extra }) + '\n'
          )
        }
        socket.on('data', authenticate)
      })
      const child = spawn(
        electron,
        [resolve('.'), '--native-helper-runtime', root, String(control.address().port), capability],
        {
          windowsHide: true,
          stdio: ['ignore', 'ignore', 'pipe'],
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, NODE_OPTIONS: undefined }
        }
      )
      processes.add(child)
      child.stderr.on('data', (b) => {
        errors += b.toString().slice(0, 1000)
      })
      const done = new Promise((resolve) =>
        child.once('exit', (code) => {
          processes.delete(child)
          control.close()
          resolve({ code, output, errors })
        })
      )
      return { child, done, output: () => output }
    }
    try {
      const check = await (await run('check')).done
      assert.equal(check.code, 0, check.errors)
      const ready = JSON.parse(check.output.trim())
      assert.equal(ready.device.banned, false)
      assert.equal(ready.competitiveReady, false)
      assert.ok(routes.has('/auth/anti-cheat/device-status'))
      banned = true
      const blocked = await (await run('check')).done
      assert.equal(JSON.parse(blocked.output.trim()).device.banned, true)
      assert.equal((await (await run('launch')).done).code, 1)
      banned = false
      assert.equal((await (await run('check', { apiOrigin: 'https://evil.example' })).done).code, 1)

      const gameRoot = process.env.NATIVE_HELPER_GAME_ROOT
      if (process.env.NATIVE_HELPER_TEST_BINARY) {
        const probe = net.createServer()
        await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
        const port = probe.address().port
        await new Promise((resolve) => probe.close(resolve))
        // The browser bridge deliberately accepts only ephemeral high ports.
        if (port >= 49152) {
          const capability = randomBytes(32).toString('hex')
          const bridge = spawn(
            process.env.NATIVE_HELPER_TEST_BINARY,
            ['--local-settings', String(port), capability, apiOrigin],
            {
              windowsHide: true,
              stdio: 'ignore',
              env: {
                ...process.env,
                LOCALAPPDATA: join(root, 'bridge-env'),
                XDG_CONFIG_HOME: join(root, 'bridge-env'),
                COMPETITIVE16_RUNTIME_EXE: electron,
                COMPETITIVE16_RUNTIME_APP: resolve('.')
              }
            }
          )
          processes.add(bridge)
          const request = (body) =>
            fetch(`http://127.0.0.1:${port}/settings`, {
              method: 'POST',
              headers: {
                origin: apiOrigin,
                authorization: `Bearer ${capability}`,
                'content-type': 'application/json'
              },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(60_000)
            })
          let available
          for (let i = 0; i < 40; i++) {
            try {
              available = await request({ action: 'get' })
              break
            } catch {
              await new Promise((r) => setTimeout(r, 50))
            }
          }
          assert.equal(available?.status, 200)
          if (gameRoot)
            assert.equal(
              (await request({ action: 'select', game: 'cs16', folderPath: gameRoot })).status,
              200
            )
          const checked = await request({ action: 'runtimeCheck', apiOrigin })
          assert.equal(checked.status, 200)
          assert.equal((await checked.json()).competitiveReady, Boolean(gameRoot))
          bridge.kill()
          processes.delete(bridge)
          console.log('Browser-to-Rust-to-Electron readiness protocol passed.')
        }
      }
      if (gameRoot) {
        await cleanFixtureLinks()
        const managedFiles =
          process.platform === 'win32'
            ? ['cstrike/cl_dlls/client_mini.dll', 'cstrike/cl_dlls/client.dll']
            : []
        const before = new Map()
        for (const name of managedFiles)
          before.set(
            name,
            createHash('sha256')
              .update(await readFile(join(gameRoot, name)))
              .digest('hex')
          )

        await writeFile(
          join(root, 'web-helper.json'),
          JSON.stringify({
            cs16: gameRoot,
            settings: {
              display: { resolution: '800x600', widescreen: false },
              enhancementsEnabled: true,
              fastSwitchEnabled: true,
              playerPingKey: 'MOUSE3',
              lightweightHud: false,
              killCardsEnabled: true
            }
          })
        )
        const valid = await (await run('check')).done
        assert.equal(JSON.parse(valid.output.trim()).competitiveReady, true, valid.errors)
        const game = await run('launch')
        const deadline = Date.now() + 60_000
        while (
          !game.output().includes('launched') &&
          game.child.exitCode === null &&
          Date.now() < deadline
        )
          await new Promise((r) => setTimeout(r, 250))
        assert.ok(game.output().includes('launched'), game.output())
        assert.ok(routes.has(`/matches/${matchId}/assets`))
        assert.ok(routes.has('/auth/anti-cheat/observations'))
        const session = join(gameRoot, '16competitive/live-session')
        if (process.platform === 'win32') {
          await new Promise((r) => setTimeout(r, 2000))
          assert.ok((await readFile(join(session, 'crosshair.conf'))).length > 10)
          kills = 1
          await new Promise((r) => setTimeout(r, 2000))
          const cards = await readFile(join(session, 'kill-cards.png'))
          assert.equal(cards.subarray(1, 4).toString(), 'PNG')
          await copyFile(join(session, 'kill-cards.png'), resolve('kill-cards-proof.png'))
          for (let i = 0; i < 20; i++) {
            await writeFile(join(session, 'scoreboard.visible'), '1\n')
            await new Promise((r) => setTimeout(r, 100))
          }
          let frame
          for (let i = 0; i < 30 && !frame; i++) {
            await writeFile(join(session, 'scoreboard.visible'), '1\n')
            await new Promise((r) => setTimeout(r, 100))
            frame = await readFile(join(session, 'overlay.png')).catch(() => null)
          }
          assert.ok(
            frame && frame.length > 1000,
            'existing scoreboard renderer must produce a frame'
          )
          await writeFile(resolve('scoreboard-proof.png'), frame)
          console.log(
            'Existing scoreboard and kill-card PNGs generated; native crosshair profile present.'
          )
        }
        // Leave the game visible briefly for VM screenshots and Tab inspection.
        await new Promise((r) =>
          setTimeout(r, Number(process.env.NATIVE_HELPER_GAME_INSPECT_MS || 5000))
        )
        finished = true
        const result = await game.done
        assert.equal(result.code, 0, result.errors)
        assert.ok(!result.output.includes(token))
        assert.ok(routes.has(`/matches/${matchId}/live-scoreboard`))
        for (const [name, digest] of before)
          assert.equal(
            createHash('sha256')
              .update(await readFile(join(gameRoot, name)))
              .digest('hex'),
            digest,
            `restored ${name}`
          )
        console.log('Original game DLL hashes restored.')
      }
      const stored = await readdir(join(root, 'runtime-data'))
      assert.ok(!stored.some((name) => /session-token|auth-session|credentials/.test(name)))
      console.log(
        `Runtime device/origin/lifetime checks passed${gameRoot ? ', including real game launch, HUD feed and cleanup' : ''}.`
      )
    } finally {
      for (const child of processes) child.kill()
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      await cleanFixtureLinks()
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    }
  }
)
