/* eslint-disable react/prop-types -- Test-only component doubles. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const source = readFileSync('src/renderer/src/features/matchmaking/LobbyPage.tsx', 'utf8')
const parsed = ts.createSourceFile(
  'LobbyPage.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
)
const scene = parsed.statements
  .find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((d) => d.name.getText(parsed) === 'LobbyScene')
  )
  .getText(parsed)
const compiled = ts.transpileModule(scene, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }
}).outputText
for (const status of ['loading', 'error', 'ready'])
  test(`lobby ${status} state keeps the expected content available`, () => {
    const deps = {
      React,
      memo: (fn) => fn,
      useState: () => [status, () => {}],
      useCallback: (fn) => fn,
      useTranslation: () => ({ t: (key) => key }),
      useNavigationStore: (select) => select({ page: 'lobby' }),
      useNewsVisibilityStore: (select) => select({ visibility: { railEnabled: false } }),
      useLobbyLoadoutStore: (select) =>
        select({
          playerModel: 'urban',
          weaponKey: 'ak47',
          weaponModelPath: null,
          weaponSkinId: null
        }),
      soloLobbyMember: (player) => player,
      modelForSlot: () => 'urban',
      presentationModelPath: (value) => value,
      defaultWeaponModelPath: () => 'p_ak47.mdl',
      LobbyModelErrorBoundary: ({ children }) => children,
      PartyModelScene: () => React.createElement('canvas'),
      Button: ({ children, ...props }) => React.createElement('button', props, children)
    }
    const Scene = new Function(...Object.keys(deps), `${compiled};return LobbyScene`)(
      ...Object.values(deps)
    )
    const html = renderToStaticMarkup(
      React.createElement(Scene, { player: { id: 'player', username: 'Test player' }, party: null })
    )
    assert.ok(html.includes('<canvas'))
    if (status === 'ready') assert.ok(!html.includes('<button'))
    else {
      assert.ok(html.includes('nav.play'))
      assert.ok(
        html.includes(status === 'loading' ? 'lobby.sceneLoading' : 'lobby.sceneUnavailable')
      )
    }
  })
