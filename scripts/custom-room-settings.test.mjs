/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { create } from 'zustand'

const source = ts.transpileModule(
  await readFile(
    new URL('../src/renderer/src/features/matchmaking/custom-games.store.ts', import.meta.url),
    'utf8'
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
).outputText
const room = {
  id: 'room-1',
  ownerId: 'owner',
  name: 'Custom Game',
  mode: 'unrated',
  mapId: 'de_dust2',
  state: 'WAITING',
  hasPassword: false,
  hostApiUrl: 'http://localhost:3000',
  members: []
}
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function harness(overrides = {}) {
  let persisted = { ...room },
    starts = 0
  const api = {
    list: async () => [persisted],
    mine: async () => persisted,
    update: async (_id, settings) => {
      persisted = { ...persisted, ...settings }
      return persisted
    },
    start: async () => {
      starts++
      return { ...persisted, state: 'READY_CHECK' }
    },
    ...overrides
  }
  const context = vm.createContext({ console, Error, window: { api: { customGames: api } } })
  const module = new vm.SourceTextModule(source, { context })
  const mocks = {
    zustand: { create },
    '../i18n/i18n': {
      translate: (_language, key) => 'translated:' + key,
      useLanguageStore: { getState: () => ({ language: 'en' }) }
    },
    './friendly-fire-message': { friendlyFireMessage: (value) => value },
    './matchmaking.store': {
      useMatchmakingStore: { getState: () => ({ selectedNodeId: 'local', match: null }) }
    },
    '../party/party.store': { usePartyStore: { getState: () => ({ refresh: async () => {} }) } }
  }
  await module.link(
    (specifier) =>
      new vm.SyntheticModule(
        Object.keys(mocks[specifier]),
        function () {
          for (const [name, value] of Object.entries(mocks[specifier])) this.setExport(name, value)
        },
        { context }
      )
  )
  await module.evaluate()
  const store = module.namespace.useCustomGamesStore
  store.setState({ currentRoom: { ...room }, rooms: [{ ...room }] })
  return { store, state: () => store.getState(), starts: () => starts }
}

test('saved mode is authoritative before ready check; polling cannot overwrite it', async () => {
  const pending = deferred(),
    poll = deferred()
  const h = await harness({ update: () => pending.promise, mine: () => poll.promise })
  h.state().openRoomSettings()
  await h.state().startRoom()
  assert.equal(h.starts(), 0)
  const saving = h.state().updateRoom({ mode: 'cs13_3v3', mapId: 'de_dust2' })
  assert.equal(h.state().savingSettings, true)
  await h.state().startRoom()
  assert.equal(h.starts(), 0)
  const refresh = h.state().refresh()
  const saved = { ...room, mode: 'cs13_3v3' }
  pending.resolve(saved)
  assert.equal(await saving, true)
  poll.resolve({ ...room })
  await refresh
  assert.equal(h.state().currentRoom.mode, 'cs13_3v3')
  assert.equal(h.state().settingsModalOpen, false)
  assert.equal(h.state().savingSettings, false)
})

test('switching mode then saving starts the newly persisted mode', async () => {
  const h = await harness()
  h.state().openRoomSettings()
  assert.equal(
    await h.state().updateRoom({ name: 'Legacy room', mode: 'legacy_3v3', mapId: 'de_inferno' }),
    true
  )
  await h.state().startRoom()
  assert.equal(h.starts(), 1)
  assert.equal(h.state().currentRoom.mode, 'legacy_3v3')
  assert.equal(h.state().currentRoom.mapId, 'de_inferno')
  assert.equal(h.state().currentRoom.state, 'READY_CHECK')
})

test('starting money is persisted with room settings before ready check', async () => {
  const h = await harness()
  assert.equal(await h.state().updateRoom({ startingMoney: 16000 }), true)
  assert.equal(h.state().currentRoom.startingMoney, 16000)
  await h.state().startRoom()
  assert.equal(h.starts(), 1)
  assert.equal(h.state().currentRoom.startingMoney, 16000)
})

test('failed save keeps the popup open and leaves the confirmed mode unchanged', async () => {
  const h = await harness({
    update: async () => {
      throw new Error('offline')
    }
  })
  h.state().openRoomSettings()
  assert.equal(await h.state().updateRoom({ mode: 'ffa' }), false)
  assert.equal(h.state().settingsModalOpen, true)
  assert.equal(h.state().currentRoom.mode, 'unrated')
  assert.equal(h.state().savingSettings, false)
  assert.ok(h.state().error)
  await h.state().refresh()
  assert.ok(h.state().error, 'polling must preserve the visible save failure')
  await h.state().startRoom()
  assert.equal(h.starts(), 0)
  h.state().closeRoomSettings()
  assert.equal(h.state().settingsModalOpen, false)
})

test('late save cannot replace another room after leaving', async () => {
  const pending = deferred()
  const h = await harness({ update: () => pending.promise })
  const saving = h.state().updateRoom({ mode: 'ffa' })
  h.store.setState({ currentRoom: { ...room, id: 'another-room' } })
  pending.resolve({ ...room, mode: 'ffa' })
  assert.equal(await saving, false)
  assert.equal(h.state().currentRoom.id, 'another-room')
})

test('friendly fire off is persisted before ready check', async () => {
  const h = await harness()
  assert.equal(await h.state().updateRoom({ friendlyFire: false }), true)
  assert.equal(h.state().currentRoom.friendlyFire, false)
  await h.state().startRoom()
  assert.equal(h.state().currentRoom.friendlyFire, false)
})

test('installation rejection is translated and does not enter the room', async () => {
  const h = await harness({
    join: async () => {
      throw new Error('legacy.error.installationRequired')
    }
  })
  h.store.setState({ currentRoom: null })
  assert.equal(await h.state().joinRoom('legacy-room'), false)
  assert.equal(h.state().currentRoom, null)
  assert.equal(h.state().error, 'translated:legacy.error.installationRequired')
})
