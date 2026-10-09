/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { isAuthReturnLink } from '../src/shared/auth-link.ts'

const source = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true)
const functions = parsed.statements
  .filter(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      ['acceptAppLink', 'focusMainWindow', 'withAuthFocus'].includes(node.name?.text)
  )
  .map((node) => node.getText(parsed))
  .join('\n')
const compiled = ts.transpileModule(functions, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText

function harness({ minimized = false, visible = true, ready = true } = {}) {
  const calls = []
  const window = {
    isDestroyed: () => false,
    isMinimized: () => minimized,
    isVisible: () => visible,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus')
  }
  const context = vm.createContext({
    mainWindow: ready ? window : null,
    BrowserWindow: { getAllWindows: () => [] },
    focusWindowWhenReady: false,
    app: { focus: () => calls.push('app.focus') },
    isAuthReturnLink,
    acceptDemoLink: (value) => calls.push(['demo', value])
  })
  vm.runInContext(compiled, context)
  return { calls, context }
}

test('auth return links contain no credentials or arbitrary parameters', () => {
  assert.equal(isAuthReturnLink('competitive16://auth-complete'), true)
  assert.equal(isAuthReturnLink('competitive16://auth-complete/'), true)
  for (const url of [
    'https://auth-complete',
    'competitive16://auth-complete?token=secret',
    'competitive16://auth-complete#fragment',
    'competitive16://user@auth-complete',
    'competitive16://auth-complete/other'
  ])
    assert.equal(isAuthReturnLink(url), false)
})

test('auth return restores a minimized launcher and brings it forward', () => {
  const { calls, context } = harness({ minimized: true, visible: false })
  context.acceptAppLink('competitive16://auth-complete')
  assert.deepEqual(calls, ['restore', 'show', 'app.focus', 'focus'])
})

test('early auth return requests focus once the main window is ready', () => {
  const { context } = harness({ ready: false })
  context.acceptAppLink('competitive16://auth-complete')
  assert.equal(context.focusWindowWhenReady, true)
})

test('demo links retain their existing handler', () => {
  const { calls, context } = harness()
  context.acceptAppLink('competitive16://play-demo?recordingId=test')
  assert.deepEqual(calls, [['demo', 'competitive16://play-demo?recordingId=test']])
})

test('polling brings the app forward even without a browser protocol handoff', async () => {
  const { calls, context } = harness()
  const result = { kind: 'email_required' }
  assert.equal(await context.withAuthFocus(Promise.resolve(result)), result)
  assert.deepEqual(calls, ['app.focus', 'focus'])
  calls.length = 0
  await assert.rejects(context.withAuthFocus(Promise.reject(new Error('cancelled'))), /cancelled/)
  assert.deepEqual(calls, ['app.focus', 'focus'])
})
