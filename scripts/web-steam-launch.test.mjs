/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const connection = {
  host: '192.0.2.1',
  port: 27016,
  password: 'a'.repeat(32),
  manualToken: `m_${'b'.repeat(48)}`
}
const matchId = '426aaf31-e665-4cee-8bd5-56475ea5db38'

async function harness(requestJson = async () => connection) {
  const location = { origin: 'https://example.test', href: '' }
  const context = vm.createContext({
    window: { location },
    document: { title: 'Web Play', addEventListener: () => undefined },
    console,
    encodeURIComponent
  })
  const modules = new Map()
  async function load(path) {
    if (modules.has(path)) return modules.get(path)
    let source = await readFile(new URL(path, import.meta.url), 'utf8')
    if (path.endsWith('browser-matchmaking.ts')) source += '\nexport { handleMessage };\n'
    const module = new vm.SourceTextModule(
      ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
      }).outputText,
      { context }
    )
    modules.set(path, module)
    await module.link(async (name) => {
      if (name === './browser-session') {
        return new vm.SyntheticModule(
          ['requestJson', 'getWebSessionToken'],
          function () {
            this.setExport('requestJson', requestJson)
            this.setExport('getWebSessionToken', () => 'test-session')
          },
          { context }
        )
      }
      const dependency = new URL(`${name}.ts`, new URL(path, import.meta.url))
      return load(dependency.href)
    })
    return module
  }
  const module = await load('../src/web/browser-matchmaking.ts')
  await module.evaluate()
  await module.namespace.handleMessage({ type: 'match_found', matchId })
  await module.namespace.handleMessage({ type: 'match_connect', matchId, ...connection })
  return { api: module.namespace, location }
}

function commands(uri) {
  assert.ok(uri.startsWith('steam://run/10//'))
  assert.ok(uri.endsWith('/'))
  return decodeURIComponent(uri.slice('steam://run/10//'.length, -1))
    .split('+')
    .map((command) => command.trim())
    .filter(Boolean)
}

for (const startup of ['cold launch', 'already running']) {
  test(`Web Play connects with current credentials after ${startup}`, async () => {
    const { api, location } = await harness()
    await api.launchBrowserMatch()
    let password = 'previous-server-password'
    let token = 'previous-match-token'
    let frame = 0
    let connects = 0
    for (const command of commands(location.href)) {
      const [name, ...args] = command.split(' ')
      if (name === 'wait') {
        frame++
        // Simulate startup overwriting credentials while launch commands wait.
        if (startup === 'cold launch' && frame === 10) {
          password = 'startup-password'
          token = 'startup-token'
        }
      } else if (name === 'setinfo') {
        assert.equal(args[0], '_16c')
        token = args[1]
      } else if (name === 'password') {
        password = args[0]
      } else if (name === 'connect') {
        assert.equal(frame, 20)
        assert.equal(token, connection.manualToken)
        assert.equal(password, connection.password)
        assert.equal(args[0], `${connection.host}:${connection.port}`)
        connects++
      } else assert.fail(`Unexpected game command: ${name}`)
    }
    assert.equal(connects, 1)
  })
}

test('reconnect fetches fresh manual credentials instead of reusing the socket password', async () => {
  const requests = []
  const fresh = { ...connection, password: 'c'.repeat(32), manualToken: `m_${'d'.repeat(48)}` }
  const { api, location } = await harness(async (path, options) => {
    requests.push({ path, options })
    return requests.length === 1 ? connection : fresh
  })
  await api.launchBrowserMatch()
  await api.browserMatchmakingApi.reconnectGame()
  assert.equal(requests.length, 2)
  for (const { path, options } of requests) {
    assert.equal(path, `/matchmaking/matches/${matchId}/manual-connection`)
    assert.equal(options.authenticated, true)
    assert.equal(options.init.method, 'POST')
  }
  assert.ok(commands(location.href).includes(`password ${fresh.password}`))
  assert.ok(commands(location.href).includes(`setinfo _16c ${fresh.manualToken}`))
})

test('invalid backend credentials never reach Steam', async () => {
  for (const invalid of [
    { ...connection, password: 'bad; quit' },
    { ...connection, manualToken: 'desktop-roster-token' },
    { ...connection, host: '192.0.2.1 +quit' },
    { ...connection, port: 70000 }
  ]) {
    const { api, location } = await harness(async () => invalid)
    await assert.rejects(api.launchBrowserMatch(), /Invalid manual connection response/)
    assert.equal(location.href, '')
  }
})

test('a late manual connection response cannot launch a different match', async () => {
  let respond
  const { api, location } = await harness(
    () =>
      new Promise((resolve) => {
        respond = resolve
      })
  )
  const launch = api.launchBrowserMatch()
  await api.handleMessage({ type: 'match_found', matchId: 'another-match' })
  respond(connection)
  await assert.rejects(launch, /This match is no longer available/)
  assert.equal(location.href, '')
})
