/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

function harness() {
  const stored = new Map()
  const exports = {}
  const source = ts.transpileModule(
    readFileSync(
      new URL(
        '../src/renderer/src/features/partner-branding/partner-servers.store.ts',
        import.meta.url
      ),
      'utf8'
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText
  const storage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key)
  }
  new Function('require', 'exports', 'window', source)(
    (name) => {
      if (name === 'zustand') return { create }
      if (name === 'zustand/middleware') return { createJSONStorage, persist }
      return {}
    },
    exports,
    { localStorage: storage }
  )
  return { createStore: exports.createPartnerServersStore, stored }
}

test('community server filter survives reload, is scoped per community, and excludes server/account state', () => {
  const { createStore, stored } = harness()
  const first = createStore('one')
  first.setState({
    rows: [{ id: 'private-server' }],
    accountId: 'account',
    selectedId: 'private-server'
  })
  first.getState().setGameFilter('cs13')
  assert.equal(createStore('one').getState().gameFilter, 'cs13')
  assert.equal(createStore('two').getState().gameFilter, 'all')
  const saved = JSON.parse(stored.get('16competitive.community-server-filter.one'))
  assert.deepEqual(saved.state, { gameFilter: 'cs13' })
})

test('invalid saved filters fall back to All', () => {
  const { createStore, stored } = harness()
  stored.set(
    '16competitive.community-server-filter.one',
    JSON.stringify({ state: { gameFilter: 'unknown' }, version: 0 })
  )
  assert.equal(createStore('one').getState().gameFilter, 'all')
})

function renderPanel(gameFilter = 'all', selectedId = 'legacy', nativeReady = false) {
  const actions = { setup: 0, connect: 0 }
  const helper = (select) => select({ nativeReady })
  helper.getState = () => ({
    show: () => {
      actions.setup += 1
    }
  })
  const state = {
    rows: [
      { id: 'legacy', gameVersion: 'cs13', name: 'Legacy server', online: true },
      { id: 'modern', gameVersion: 'cs16', name: 'Modern server', online: true }
    ],
    connect: async () => {
      actions.connect += 1
    },
    gameFilter,
    selectedId,
    status: 'ready',
    connecting: false,
    setGameFilter() {
      return undefined
    },
    select() {
      return undefined
    }
  }
  const useServers = (select) => select(state)
  const jsx = (type, props) => ({ type, props })
  const dependencies = {
    '../matchmaking/web-helper-prompt.store': { useWebHelperPromptStore: helper },
    react: {
      useEffect() {
        return undefined
      },
      useMemo: (factory) => factory()
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '../../web-runtime': { isWebRuntime: () => true },
    '../community/links': { useHideDesktopOnlyFeatures: () => true },
    '../i18n/i18n': { useTranslation: () => ({ t: (key) => key }) },
    './community-copy': { useCommunityText: () => (key) => key },
    './partner-servers.store': {
      createPartnerServersStore: () => useServers,
      usePartnerServersStore: useServers
    },
    './partner-launch.store': { usePartnerLaunchStore: (select) => select({ busy: 'idle' }) },
    '../party/party.store': { usePartyStore: (select) => select({ party: null }) },
    '../auth/auth.store': { useAuthStore: (select) => select({ session: null }) },
    '../../../../shared/partner-community': { serverIsFull: () => false },
    'tailwind-merge': { twMerge: (...values) => values.filter(Boolean).join(' ') },
    '../../components/ui/Button': { Button: 'Button' },
    '../matchmaking/FindMatchButton': { FindMatchButton: 'FindMatchButton' },
    '../../components/ui/TabList': { TabList: 'TabList' }
  }
  const source = ts.transpileModule(
    readFileSync(
      new URL(
        '../src/renderer/src/features/partner-branding/PartnerServersPanel.tsx',
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
  const exports = {}
  new Function('require', 'exports', source)((name) => dependencies[name] ?? {}, exports)
  const tree = exports.PartnerServersPanel({ communityId: 'partner' })
  const nodes = []
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    nodes.push(node)
    walk(node.props?.children)
  }
  walk(tree)
  nodes.actions = actions
  return nodes
}

test('web partners without desktop downloads still display and filter CS13 servers', () => {
  const all = renderPanel()
  assert.deepEqual(
    all.find((node) => node.type === 'TabList').props.items.map((item) => item.value),
    ['all', 'cs16', 'cs13']
  )
  assert.equal(
    all.filter((node) => node.props?.className?.includes('community-server-card')).length,
    2
  )
  const legacy = renderPanel('cs13')
  assert.equal(
    legacy.filter((node) => node.props?.className?.includes('community-server-card')).length,
    1
  )
  // Play opens helper setup when it is unavailable.
  assert.equal(legacy.find((node) => node.type === 'FindMatchButton').props.disabled, false)
  const play = legacy.find((node) => node.type === 'FindMatchButton')
  play.props.onClick()
  assert.equal(legacy.actions.setup, 1)
  assert.equal(legacy.actions.connect, 0)
  assert.ok(legacy.some((node) => node.props?.children === 'cs13WebUnavailable'))
})

test('a ready web helper enables CS13 community connection without launcher-only messaging', () => {
  const nodes = renderPanel('cs13', 'legacy', true)
  const play = nodes.find((node) => node.type === 'FindMatchButton')
  assert.equal(play.props.disabled, false)
  play.props.onClick()
  assert.equal(nodes.actions.connect, 1)
  assert.equal(nodes.actions.setup, 0)
  assert.equal(
    nodes.some((node) => node.props?.children === 'cs13WebUnavailable'),
    false
  )
})
