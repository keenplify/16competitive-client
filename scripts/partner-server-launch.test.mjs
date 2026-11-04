/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/main/game/cs16-launcher.ts', import.meta.url), 'utf8')
const parsed = ts.createSourceFile('launcher.ts', source, ts.ScriptTarget.Latest, true)
const declaration = (name) =>
  parsed.statements
    .find(
      (node) =>
        ts.isVariableStatement(node) &&
        node.declarationList.declarations.some((decl) => decl.name.getText(parsed) === name)
    )
    .getText(parsed)
    .replace(/^export /, '')
const code = ts.transpile(declaration('launchOrdinaryCounterStrike'), {
  target: ts.ScriptTarget.ES2022
})
const launcher = (queue, cleanup) =>
  new Function('launchQueue', 'shutdownManagedGame', `${code}; return launchOrdinaryCounterStrike`)(
    queue,
    cleanup
  )

test('ordinary launches wait for managed launch and restoration, then run serially', async () => {
  const events = []
  let finishManaged, finishCleanup
  const managed = new Promise((resolve) => {
    finishManaged = resolve
  })
  const cleanup = new Promise((resolve) => {
    finishCleanup = resolve
  })
  const launch = launcher(managed, async () => {
    events.push('cleanup')
    await cleanup
  })
  const first = launch(async () => {
    events.push('first')
  })
  const second = launch(async () => {
    events.push('second')
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(events, [])
  finishManaged()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(events, ['cleanup'])
  finishCleanup()
  await Promise.all([first, second])
  assert.deepEqual(events, ['cleanup', 'first', 'cleanup', 'second'])
})

test('failed managed restoration prevents an ordinary replacement launch', async () => {
  let launched = false
  const launch = launcher(Promise.resolve(), async () => {
    throw new Error('restoration failed')
  })
  await assert.rejects(
    launch(async () => {
      launched = true
    }),
    /restoration failed/
  )
  assert.equal(launched, false)
})

test('both launcher visibility preferences use the same native match handoff', async () => {
  const source = ts.transpile(declaration('launchCounterStrikeForMatch'), {
    target: ts.ScriptTarget.ES2022
  })
  for (const lightweightHud of [true, false]) {
    const calls = []
    const deps = {
      launchQueue: Promise.resolve(),
      forcedLaunchInFlight: null,
      matchmakingDiagnostics: { record: () => {} },
      getGameSettings: async () => ({ lightweightHud }),
      standaloneSessionStatus: () => ({ owned: false }),
      shutdownManagedGame: async () => {
        calls.push('cleanup')
      },
      launchStandaloneSession: async (id, api, settings, onExit) => {
        calls.push({ id, api, settings, onExit })
      }
    }
    const launch = new Function(
      ...Object.keys(deps),
      `${source};return launchCounterStrikeForMatch`
    )(...Object.values(deps))
    const onExit = () => {}
    await launch({ matchId: 'match', apiUrl: 'https://example.test', onExit })
    assert.deepEqual(calls, [
      'cleanup',
      { id: 'match', api: 'https://example.test', settings: { lightweightHud }, onExit }
    ])
  }
})
