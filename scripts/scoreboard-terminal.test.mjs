import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'
import { join } from 'node:path'
import ts from 'typescript'

test('terminal feed revokes live data without ending native ownership before game exit', async () => {
  const source = await readFile(
    new URL('../src/main/game/scoreboard-overlay.ts', import.meta.url),
    'utf8'
  )
  const ast = ts.createSourceFile('overlay.ts', source, ts.ScriptTarget.Latest, true)
  const sessionClass = ast.statements.find(
    (node) => ts.isClassDeclaration(node) && node.name.text === 'ScoreboardOverlaySession'
  )
  const methods = sessionClass.members.filter(
    (node) =>
      ts.isMethodDeclaration(node) &&
      ['refresh', 'scheduleRefresh'].includes(node.name.getText(ast))
  )
  const compiled = ts.transpileModule(
    `class Fixture { ${methods.map((node) => node.getText(ast)).join('\n')} }; globalThis.Fixture = Fixture`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText
  const removed = [],
    cleared = []
  let requests = 0,
    stops = 0
  const context = vm.createContext({
    console,
    URL,
    AbortSignal,
    Date,
    join,
    captureGamePerformance: async () => undefined,
    getSessionToken: () => 'test-token',
    readNativeScores: async () => null,
    fetch: async () => {
      requests++
      return new Response(null, { status: 410 })
    },
    unlink: async (path) => {
      removed.push(path)
    },
    clearInterval: (timer) => {
      cleared.push(timer)
    }
  })
  vm.runInContext(compiled, context)
  const session = Object.assign(new context.Fixture(), {
    directory: '/session',
    matchId: 'ended',
    apiUrl: 'https://api.invalid',
    feedPath: '/session/feed.tsv',
    requests: new AbortController(),
    stopped: false,
    terminalMatch: false,
    busy: false,
    feedAvailable: true,
    transportFeed: 'old authenticated feed',
    transportRevision: 'old',
    lastSnapshot: { players: [] },
    lastKillCardState: null,
    present: async () => undefined,
    timer: 'poll',
    stop: () => {
      stops++
    }
  })
  await session.refresh()
  assert.equal(requests, 1)
  assert.equal(stops, 0, 'Game ownership must survive the result-viewing window')
  assert.equal(session.terminalMatch, true)
  assert.equal(session.feedAvailable, false)
  assert.equal(session.transportFeed, null)
  assert.ok(session.lastSnapshot, 'The final authenticated scoreboard remains viewable')
  assert.deepEqual(removed, ['/session/feed.tsv'])
  assert.deepEqual(cleared, ['poll'])
  await session.refresh()
  session.scheduleRefresh()
  assert.equal(requests, 1, 'A finished match must stop requesting live data')
})
