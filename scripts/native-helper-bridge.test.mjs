/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'

const binary = process.env.NATIVE_HELPER_TEST_BINARY

test(
  'real native helper picks both game folders and persists local launch preferences',
  { skip: !binary || process.platform !== 'linux' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'native-helper-bridge-'))
    let child
    try {
      const bin = join(root, 'bin')
      const choice = join(root, 'choice')
      await mkdir(bin)
      await writeFile(join(bin, 'zenity'), '#!/bin/sh\ncat "$NATIVE_HELPER_TEST_CHOICE"\n')
      await chmod(join(bin, 'zenity'), 0o700)
      for (const game of ['cs13', 'cs16']) {
        const folder = join(root, game)
        await mkdir(join(folder, 'cstrike/cl_dlls'), { recursive: true })
        await writeFile(
          join(folder, 'cstrike/liblist.gam'),
          `game "Counter-Strike"\nversion "${game === 'cs13' ? '1.3' : '1.6'}"\n`
        )
        await writeFile(join(folder, game === 'cs13' ? 'hl.exe' : 'hl_linux'), 'fixture')
        await writeFile(
          join(folder, 'cstrike/cl_dlls', game === 'cs13' ? 'client.dll' : 'client.so'),
          'fixture'
        )
      }
      const runtime = join(root, 'runtime-fixture.mjs')
      await writeFile(
        runtime,
        `#!/usr/bin/env node
import net from 'node:net';
const i = process.argv.indexOf('--native-helper-runtime');
const socket = net.createConnection({host:'127.0.0.1',port:Number(process.argv[i+2])});
socket.on('connect',()=>socket.write(JSON.stringify({protocol:1,capability:process.argv[i+3]})+'\\n'));
let input='';
socket.on('data',chunk=>{input+=chunk; if(!input.includes('\\n'))return;
const request=JSON.parse(input.split('\\n')[0]);
socket.end(JSON.stringify({ok:request.action==='launchPartner',partner:request.partner})+'\\n',()=>socket.destroy());});
`
      )
      await chmod(runtime, 0o700)
      const token = 'a'.repeat(64)
      let port
      for (let attempt = 0; attempt < 20; attempt++) {
        const probe = net.createServer()
        const candidate = 49152 + Math.floor(Math.random() * 16384)
        try {
          await new Promise((resolve, reject) => {
            probe.once('error', reject)
            probe.listen(candidate, '127.0.0.1', resolve)
          })
          await new Promise((resolve) => probe.close(resolve))
          port = candidate
          break
        } catch {
          probe.close()
        }
      }
      assert.ok(port)
      const origin = 'http://127.0.0.1:5189'
      child = spawn(binary, ['--local-settings', String(port), token, origin], {
        env: {
          ...process.env,
          XDG_CONFIG_HOME: join(root, 'config'),
          PATH: `${bin}:${process.env.PATH}`,
          COMPETITIVE16_RUNTIME_EXE: runtime,
          NATIVE_HELPER_TEST_CHOICE: choice
        },
        stdio: 'pipe'
      })
      const request = (body, auth = token, webOrigin = origin) =>
        fetch(`http://127.0.0.1:${port}/settings`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${auth}`,
            origin: webOrigin,
            'content-type': 'application/json'
          },
          body: JSON.stringify(body)
        })
      let initial
      for (let i = 0; i < 40; i++) {
        try {
          initial = await request({ action: 'get' })
          break
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }
      assert.equal(initial?.status, 200)
      assert.equal((await request({ action: 'get' }, 'wrong')).status, 403)
      assert.equal((await request({ action: 'get' }, token, 'https://evil.test')).status, 403)
      const partner = {
        serverId: '583704ab-6fc5-4b58-8fc2-d91cf1d7c051',
        groupId: null,
        communityId: null
      }
      const partnerRequest = {
        action: 'partnerLaunch',
        apiOrigin: origin,
        token: 'fixture-session',
        ...partner
      }
      assert.equal((await request(partnerRequest, 'wrong')).status, 403)
      assert.equal((await request(partnerRequest, token, 'https://evil.test')).status, 403)
      assert.equal((await request({ ...partnerRequest, executable: '/bin/sh' })).status, 400)
      const launched = await request(partnerRequest)
      assert.equal(launched.status, 200)
      assert.deepEqual(await launched.json(), { ok: true, partner })

      let settings
      for (const game of ['cs13', 'cs16']) {
        await writeFile(choice, join(root, game))
        const response = await request({ action: 'choose', game })
        assert.equal(response.status, 200)
        settings = await response.json()
        assert.equal(
          settings[game === 'cs13' ? 'cs13FolderPath' : 'cs16FolderPath'],
          join(root, game)
        )
      }
      const incomplete = join(root, 'incomplete')
      await mkdir(join(incomplete, 'cstrike'), { recursive: true })
      await writeFile(join(incomplete, 'cstrike/liblist.gam'), 'version "1.6"\n')
      await writeFile(choice, incomplete)
      const rejected = await request({ action: 'choose', game: 'cs16' })
      assert.equal(rejected.status, 400)
      assert.deepEqual(await rejected.json(), { code: 'INVALID_GAME_INSTALLATION' })
      await writeFile(choice, join(root, 'cs16'))
      const retried = await request({ action: 'choose', game: 'cs16' })
      assert.equal(retried.status, 200)
      assert.equal((await retried.json()).cs16FolderPath, join(root, 'cs16'))
      const {
        cs13FolderPath,
        cs16FolderPath,
        nextClientDetected,
        platform,
        helperVersion,
        ...preferences
      } = settings
      assert.equal(platform, 'linux')
      assert.match(helperVersion, /^\d{4}\.\d{4}\.\d+$/)
      assert.equal(nextClientDetected, false)
      assert.ok(cs13FolderPath && cs16FolderPath)
      const saved = await request({
        action: 'save',
        settings: {
          ...preferences,
          fastSwitchEnabled: false,
          enhancementsEnabled: false,
          killCardsEnabled: false,
          display: { resolution: '1280x960', widescreen: false }
        }
      })
      assert.equal(saved.status, 200)
      const stored = JSON.parse(
        await readFile(join(root, 'config/16competitive/web-helper.json'), 'utf8')
      )
      assert.equal(stored.cs13, cs13FolderPath)
      assert.equal(stored.cs16, cs16FolderPath)
      assert.equal(stored.settings.fastSwitchEnabled, false)
      assert.equal(stored.settings.display.resolution, '1280x960')
      const selected = await request({ action: 'select', game: 'cs16', folderPath: cs16FolderPath })
      assert.equal(
        selected.status,
        200,
        'camelCase browser fields are accepted by the native protocol'
      )
      const voicePath = join(root, 'config/16competitive/voice-ptt.json')
      const matchId = '12345678-1234-4234-8234-123456789abc'
      await writeFile(voicePath, JSON.stringify({ matchId, team: true, party: false }))
      assert.equal((await request({ action: 'voiceStream' }, 'wrong')).status, 403)
      const voice = await request({ action: 'voiceStream' })
      assert.equal(voice.status, 200)
      const reader = voice.body.getReader()
      let received = ''
      const nextUntil = async (text) => {
        const end = Date.now() + 5000
        while (!received.includes(text) && Date.now() < end) {
          const value = await reader.read()
          assert.ok(!value.done)
          received += new TextDecoder().decode(value.value)
        }
        assert.ok(received.includes(text), received)
      }
      await nextUntil('"team":true')
      received = ''
      await utimes(voicePath, new Date(0), new Date(0))
      await nextUntil('"team":false')
      await reader.cancel()
      assert.equal(
        (await request({ action: 'save', settings: { ...preferences, arbitraryPath: '/outside' } }))
          .status,
        400
      )
    } finally {
      if (child) {
        child.kill('SIGTERM')
        await new Promise((resolve) => child.once('exit', resolve))
      }
      await rm(root, { recursive: true, force: true })
    }
  }
)
