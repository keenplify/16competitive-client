/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const connection = {
  host: '192.0.2.1',
  port: 27016,
  password: 'a'.repeat(22),
  manualToken: `m_${'b'.repeat(22)}`
}
const matchId = '426aaf31-e665-4cee-8bd5-56475ea5db38'

async function harness(requestJson = async () => connection, hosted = false) {
  const stored = new Map()
  let reloads = 0
  const location = {
    origin: 'https://example.test',
    href: '',
    reload: () => {
      reloads++
    }
  }
  const context = vm.createContext({
    window: { location },
    document: {
      querySelector: (selector) =>
        hosted && selector.includes('16c-api-origin')
          ? { content: 'https://api.example.com' }
          : null,
      title: 'Web Play',
      addEventListener: () => undefined
    },
    URL,
    sessionStorage: { setItem: (k, v) => stored.set(k, v), getItem: (k) => stored.get(k) ?? null },
    localStorage: {
      getItem: (k) => stored.get(k) ?? null,
      setItem: (k, v) => stored.set(k, v),
      removeItem: (k) => stored.delete(k)
    },
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
          ['requestJson', 'getWebSessionToken', 'currentApiOrigin'],
          function () {
            this.setExport('requestJson', requestJson)
            this.setExport('currentApiOrigin', () => location.origin)
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
  return { api: module.namespace, location, stored, reloads: () => reloads }
}

function commands(uri) {
  assert.ok(uri.startsWith('steam://run/10//'))
  assert.ok(uri.endsWith('/'))
  return decodeURIComponent(uri.slice('steam://run/10//'.length, -1))
    .split('+')
    .map((command) => command.trim())
    .filter(Boolean)
}

// The installed Steam GoldSrc Cmd_StuffCmds_f concatenates argv and scans for
// either sign without respecting quoting. Model that parser, not split('+').
function steamStartupCommands(uri) {
  const raw = decodeURIComponent(uri.slice('steam://run/10//'.length, -1))
  return (raw.match(/\+[^+-]*/g) ?? []).map((command) => command.slice(1).trim())
}
function commandArgs(command) {
  return (command.match(/"[^"\n]*"|[^\s]+/g) ?? []).map((value) => value.replace(/^"|"$/g, ''))
}

test('Web Play preserves current credentials through Steam GoldSrc startup parsing', async () => {
  const { api, location } = await harness()
  await api.launchBrowserMatch()
  let password = 'previous-server-password',
    token = 'previous-match-token',
    frame = 0,
    connects = 0
  for (const command of steamStartupCommands(location.href)) {
    const [name, ...args] = commandArgs(command)
    if (name === 'wait') {
      frame++
      if (frame === 10) {
        password = 'startup-password'
        token = 'startup-token'
      }
    } else if (name === 'setinfo') {
      assert.equal(args[0], '_16c')
      token = args[1]
    } else if (name === 'password') password = args[0]
    else if (name === 'connect') {
      assert.equal(frame, 20)
      assert.equal(token, connection.manualToken)
      assert.equal(password, connection.password)
      assert.equal(args[0], `${connection.host}:${connection.port}`)
      connects++
    } else assert.fail(`Unexpected game command: ${name}`)
  }
  assert.equal(connects, 1)
})

test('hyphenated live credentials never produce a truncated Steam connection', async () => {
  for (const legacy of [
    { ...connection, password: 'aaaa-bbbbbbbbbbbbbbbbbb' },
    { ...connection, password: '-' + 'a'.repeat(21) },
    { ...connection, manualToken: `m_${'b'.repeat(10)}-${'b'.repeat(11)}` },
    { ...connection, host: 'match-host.example.test' }
  ]) {
    const { api, location } = await harness(async () => legacy)
    await assert.rejects(api.launchBrowserMatch(), /WEB_STEAM_CREDENTIALS_UNSUPPORTED/)
    assert.equal(location.href, '')
  }
})

test('public FFA explicitly clears an old password before connecting', async () => {
  const { api, location } = await harness(async () => ({ ...connection, password: '' }))
  await api.launchBrowserMatch()
  const parsed = steamStartupCommands(location.href).map(commandArgs)
  assert.deepEqual(
    parsed.find((args) => args[0] === 'password'),
    ['password', '']
  )
  assert.equal(parsed.at(-1)[0], 'connect')
})

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
  assert.ok(commands(location.href).includes(`password "${fresh.password}"`))
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

test('partner region selection preserves its custom page and reloads with the chosen API', async () => {
  const h = await harness(async () => connection, true)
  await h.api.navigateToNode('https://warsaw.example.com', 'warsaw')
  assert.equal(h.location.href, '')
  assert.equal(h.reloads(), 1)
  assert.equal(h.stored.get('16competitive.web.partner-api-origin'), 'https://warsaw.example.com')
  assert.equal(h.stored.get('16competitive.web.selected-node'), 'warsaw')
})
