/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(
  await readFile(new URL('../src/main/auth.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
).outputText

async function harness(email, socialResult) {
  const writes = []
  const requests = []
  const player = {
    id: 'test-player',
    username: 'steam_player',
    email,
    mmr: 1000,
    points: 0,
    flagCountryCode: null,
    createdAt: '2026-10-09T00:00:00Z',
    hasPassword: false
  }
  const context = vm.createContext({
    URL,
    Date,
    AbortSignal,
    setTimeout: (callback) => {
      callback()
    },
    fetch: async (url, options) => {
      requests.push({ url, body: options?.body ? JSON.parse(options.body) : null })
      if (url.endsWith('/start')) {
        return Response.json({
          authorizationUrl: 'https://steamcommunity.com/openid/login',
          pollToken: 'test-only-poll-token'.repeat(3),
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        })
      }
      if (url.endsWith('/social/complete') && socialResult) {
        return Response.json(socialResult, { status: 202 })
      }
      if (url.endsWith('/social/link/complete')) {
        return Response.json(
          Object.fromEntries(
            ['steam', 'google', 'facebook', 'discord'].map((provider) => [
              provider,
              { connected: provider === 'steam', email: null }
            ])
          )
        )
      }
      return Response.json(
        url.endsWith('/username/status')
          ? { requiresUsernameSetup: true, usernameChangeAvailableAt: null }
          : { token: 'test-only-token', expiresAt: '2099-01-01T00:00:00Z', player }
      )
    }
  })
  const dependencies = {
    '../shared/auth': { validateSteamAuthorizationUrl: (url) => url },
    './config': { API_BASE_URL: 'https://backend.example.test' },
    '../shared/server-clock': { serverClockNow: () => Date.now(), syncServerClock: () => {} },
    electron: {
      app: { getPath: () => '/test-only' },
      shell: { openExternal: async () => {} },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (token) => Buffer.from('encrypted:' + token),
        decryptString: () => 'test-only-token'
      }
    },
    'node:fs/promises': {
      readFile: async () => Buffer.from('encrypted:test-only-token'),
      writeFile: async (...args) => {
        writes.push(args)
      },
      unlink: async () => {}
    },
    'node:path': { join }
  }
  const module = new vm.SourceTextModule(source, { context })
  await module.link(async (name) => {
    const exports = dependencies[name]
    if (!exports) throw new Error('Unexpected dependency ' + name)
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  return { api: module.namespace, writes, requests }
}

test('desktop social sign-in declares its return target, including first-signup completion', async () => {
  const { api, requests } = await harness(null)
  const session = await api.authenticateWithSocial('steam')
  assert.equal(session.player.username, 'steam_player')
  assert.deepEqual(requests.find((request) => request.url.endsWith('/start')).body, {
    provider: 'steam',
    client: 'desktop'
  })
})

test('desktop social sign-in preserves additional account confirmation steps', async () => {
  const { api } = await harness(null, { pending: true, requiresEmail: true })
  assert.equal((await api.authenticateWithSocial('steam')).kind, 'email_required')
})

test('desktop account linking also declares its return target', async () => {
  const { api, requests } = await harness(null)
  await api.restoreSession()
  const connections = await api.connectSocial('steam')
  assert.equal(connections.steam.connected, true)
  assert.deepEqual(requests.find((request) => request.url.endsWith('/link/start')).body, {
    provider: 'steam',
    client: 'desktop'
  })
})

for (const email of [null, 'player@example.test']) {
  test(`accepts and securely persists a session with email ${email}`, async () => {
    const { api, writes } = await harness(email)
    const session = await api.authenticate('login', {
      username: 'player',
      password: 'test-password'
    })
    assert.equal(session.player.email, email)
    assert.equal(session.player.requiresUsernameSetup, true)
    assert.equal('token' in session, false)
    assert.equal(writes.length, 1)
    assert.equal(writes[0][1].toString(), 'encrypted:test-only-token')
    assert.equal(writes[0][2].mode, 0o600)
  })
  test(`restores an encrypted session with email ${email}`, async () => {
    const { api } = await harness(email)
    const session = await api.restoreSession()
    assert.equal(session.player.email, email)
    assert.equal(session.player.username, 'steam_player')
    assert.equal('token' in session, false)
  })
}

for (const email of [undefined, 123, {}, false]) {
  test(`rejects malformed email metadata: ${JSON.stringify(email)}`, async () => {
    const { api, writes } = await harness(email)
    await assert.rejects(
      api.authenticate('login', { username: 'player', password: 'test-password' }),
      /invalid response/
    )
    assert.equal(writes.length, 0)
    assert.equal(await api.restoreSession(), null)
  })
}
