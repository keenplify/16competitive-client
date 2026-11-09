/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const modes = ['unrated', 'cs13_3v3', 'ffa', 'arena']
const noop = () => undefined
const maps = [
  { id: 'de_mirage', displayName: 'Mirage', customModes: ['unrated'] },
  { id: 'fy_iceworld2k', displayName: 'Iceworld', customModes: ['arena'] },
  { id: 'fy_ankara', displayName: 'Ankara', customModes: ['arena'] }
]

async function formHarness(
  component,
  selectedMode = 'arena',
  roomMode = 'unrated',
  hideDesktop = false
) {
  const source = ts.transpileModule(
    await readFile(
      new URL(`../src/renderer/src/features/matchmaking/${component}.tsx`, import.meta.url),
      'utf8'
    ),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      }
    }
  ).outputText
  const state = { selectedMode, customModes: [...modes] }
  const submitted = []
  const room = { id: 'room', name: 'Existing room', mode: roomMode, mapId: 'de_mirage' }
  const roomState = {
    closeCreateModal: noop,
    closeRoomSettings: noop,
    savingSettings: false,
    error: null,
    createRoom: async (settings) => {
      submitted.push(settings)
      return false
    },
    updateRoom: async (settings) => {
      submitted.push(settings)
      return true
    }
  }
  let cursor = 0
  const slots = []
  const useState = (initial) => {
    const index = cursor++
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
    return [
      slots[index],
      (value) => {
        slots[index] = value
      }
    ]
  }
  const matchmaking = (select) => select(state)
  matchmaking.getState = () => state
  const jsx = (type, props) => ({ type, props })
  const context = vm.createContext({ console })
  const module = new vm.SourceTextModule(source, { context })
  await module.link((specifier) => {
    const exports =
      specifier === 'react/jsx-runtime'
        ? { jsx, jsxs: jsx, Fragment: 'fragment' }
        : specifier === 'react'
          ? { useState, useRef: () => ({ current: null }) }
          : specifier.includes('custom-games.store')
            ? { useCustomGamesStore: (select) => select(roomState) }
            : specifier.includes('matchmaking.store')
              ? { useMatchmakingStore: matchmaking }
              : specifier.includes('shared/custom-games')
                ? { CUSTOM_GAME_MODES: modes, isCustomGameMode: (value) => modes.includes(value) }
                : specifier.includes('i18n')
                  ? { useTranslation: () => ({ t: (key) => key }) }
                  : specifier.includes('community/links')
                    ? { useHideDesktopOnlyFeatures: () => hideDesktop }
                    : specifier === 'tailwind-merge'
                      ? { twMerge: (...values) => values.filter(Boolean).join(' ') }
                      : Object.fromEntries(
                          [...source.matchAll(/import \{ ([\w]+) \} from/g)].map((match) => [
                            match[1],
                            match[1]
                          ])
                        )
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  const render = (catalog = maps) => {
    cursor = 0
    return module.namespace[component]({ maps: catalog, selectedNodeId: 'node', room })
  }
  return { state, submitted, render }
}

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null
  if (predicate(tree)) return tree
  for (const child of [tree.props?.children].flat(Infinity)) {
    const found = find(child, predicate)
    if (found) return found
  }
  return null
}

test('creating a room after choosing Arena uses Arena and an Arena map', async () => {
  const h = await formHarness('CreateCustomGameModal')
  const tree = h.render()
  assert.equal(find(tree, (node) => node.type === 'select').props.value, 'arena')
  find(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault: noop })
  assert.equal(h.submitted[0].mode, 'arena')
  assert.equal(h.submitted[0].mapId, 'fy_iceworld2k')
})

for (const component of ['CreateCustomGameModal', 'RoomSettingsModal']) {
  test(`${component} never substitutes Ankara for explicitly selected Iceworld`, async () => {
    const h = await formHarness(component, 'unrated')
    let tree = h.render()
    find(tree, (node) => node.type === 'select').props.onChange({ target: { value: 'arena' } })
    tree = h.render()
    const mapSelect = (node) => node.type === 'select' && node.props.value !== 'arena'
    find(tree, mapSelect).props.onChange({ target: { value: 'fy_ankara' } })
    tree = h.render()
    find(tree, mapSelect).props.onChange({ target: { value: 'fy_iceworld2k' } })
    tree = h.render(maps.filter((map) => map.id !== 'fy_iceworld2k'))
    assert.equal(find(tree, mapSelect).props.value, 'fy_iceworld2k')
    find(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault: noop })
    assert.equal(h.submitted.length, 0)
    tree = h.render()
    find(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault: noop })
    assert.equal(h.submitted[0].mode, 'arena')
    assert.equal(h.submitted[0].mapId, 'fy_iceworld2k')
  })
  test(`${component} retains Arena and cannot submit Unranked after a catalog failure`, async () => {
    const h = await formHarness(component, 'unrated')
    let tree = h.render()
    assert.equal(find(tree, (node) => node.type === 'select').props.value, 'unrated')
    find(tree, (node) => node.type === 'select').props.onChange({ target: { value: 'arena' } })
    tree = h.render()
    assert.equal(find(tree, (node) => node.type === 'select').props.value, 'arena')
    h.state.customModes = []
    tree = h.render()
    assert.equal(find(tree, (node) => node.type === 'select').props.value, 'arena')
    find(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault: noop })
    assert.equal(h.submitted.length, 0)
    h.state.customModes = [...modes]
    tree = h.render()
    find(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault: noop })
    assert.equal(h.submitted[0].mode, 'arena')
    assert.equal(h.submitted[0].mapId, 'fy_iceworld2k')
  })
}

test('existing actual CS 1.3 room remains saveable while its catalog is unavailable', async () => {
  const h = await formHarness('RoomSettingsModal', 'cs13_3v3', 'cs13_3v3', true)
  h.state.customModes = []
  const tree = h.render([])
  const save = find(tree, (node) => node.props?.type === 'submit')
  assert.equal(save.props.disabled, false)
  find(tree, (node) => node.type === 'form').props.onSubmit({ preventDefault: noop })
  assert.equal(h.submitted[0].mode, 'cs13_3v3')
  assert.equal(h.submitted[0].mapId, 'de_mirage')
  assert.equal(h.submitted[0].legacyMode, false)
})
