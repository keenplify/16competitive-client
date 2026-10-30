import { readFileSync } from 'node:fs'
import ts from 'typescript'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadCustomGameList } from '../src/shared/custom-game-list.ts'

const node = (id, latencyMs, available = true) => ({ id, latencyMs, available })

test('a missing saved server falls back to the nearest responding region', async () => {
  const calls = []
  const rooms = [{ id: 'room' }]
  const result = await loadCustomGameList(
    [node('far', 240), node('nearest', 30), node('unknown', null)],
    'retired-node-id',
    async ({ id }) => {
      calls.push(id)
      return rooms
    }
  )
  assert.deepEqual(calls, ['nearest'])
  assert.equal(result, rooms)
})

test('a reachable selected server keeps its filter even when another region is nearer', async () => {
  const calls = []
  assert.deepEqual(
    await loadCustomGameList(
      [node('nearest', 30), node('selected', 240)],
      'selected',
      async ({ id }) => {
        calls.push(id)
        return []
      }
    ),
    []
  )
  assert.deepEqual(calls, ['selected'])
})

test('a stale discovery entry that fails HTTP falls back through measured regions', async () => {
  const calls = []
  await loadCustomGameList(
    [node('unknown', null), node('far', 240), node('nearest', 30), node('saved', 50)],
    'saved',
    async ({ id }) => {
      calls.push(id)
      if (id !== 'far') throw new Error('offline')
      return []
    }
  )
  assert.deepEqual(calls, ['saved', 'nearest', 'far'])
})

test('match capacity does not prevent browsing existing rooms', async () => {
  const calls = []
  await loadCustomGameList([node('full', 30, false)], 'full', async ({ id }) => {
    calls.push(id)
    return []
  })
  assert.deepEqual(calls, ['full'])
})

test('all-server browsing deduplicates rooms and tolerates partial outages', async () => {
  const room = { id: 'room' }
  assert.deepEqual(
    await loadCustomGameList(
      [node('one', 10), node('two', 20), node('offline', null)],
      null,
      async ({ id }) => {
        if (id === 'offline') throw new Error('offline')
        return [room]
      }
    ),
    [room]
  )
})

test('an empty registry or total outage remains an error rather than an empty success', async () => {
  await assert.rejects(
    loadCustomGameList([], 'retired', async () => []),
    /customGames.listUnavailable/
  )
  for (const selection of [null, 'saved']) {
    await assert.rejects(
      loadCustomGameList([node('saved', null)], selection, async () => {
        throw new Error('offline')
      }),
      /customGames.listUnavailable/
    )
  }
})

test('partner web custom creation includes backend-enabled CS13 and excludes disabled modes', () => {
  const source = ts.transpileModule(
    readFileSync(
      new URL(
        '../src/renderer/src/features/matchmaking/CreateCustomGameModal.tsx',
        import.meta.url
      ),
      'utf8'
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      }
    }
  ).outputText
  for (const enabled of [['unrated', 'ffa', 'cs13_3v3'], ['unrated']]) {
    const jsx = (type, props) => ({ type, props })
    const dependencies = {
      react: { useState: (initial) => [initial, () => undefined] },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      '../community/links': { useHideDesktopOnlyFeatures: () => true },
      '../i18n/i18n': { useTranslation: () => ({ t: (key) => key }) },
      '../../../../shared/custom-games': { CUSTOM_GAME_MODES: ['unrated', 'ffa', 'cs13_3v3'] },
      './matchmaking.store': { useMatchmakingStore: (select) => select({ customModes: enabled }) },
      './custom-games.store': { useCustomGamesStore: (select) => select({}) }
    }
    const exports = {}
    new Function('require', 'exports', source)((name) => dependencies[name] ?? {}, exports)
    const tree = exports.CreateCustomGameModal({ maps: [], selectedNodeId: null })
    const options = []
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (!node || typeof node !== 'object') return
      if (node.type === 'option' && node.props.value) options.push(node.props.value)
      walk(node.props?.children)
    }
    walk(tree)
    assert.deepEqual(options, enabled)
  }
})
