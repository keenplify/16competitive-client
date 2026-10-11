import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recommendLightweightHud } from '../src/main/game/recommended-hud.ts'

const desktop = {
  platform: 'linux',
  architecture: 'x64',
  machine: 'x86_64',
  memoryBytes: 16 * 1024 ** 3,
  cpuModels: Array(8).fill('AMD Ryzen 7')
}

test('Asahi and translated Electron use lightweight HUD regardless of RAM/core count', () => {
  assert.equal(
    recommendLightweightHud({ ...desktop, architecture: 'arm64', machine: 'aarch64' }),
    true
  )
  assert.equal(recommendLightweightHud({ ...desktop, machine: 'aarch64' }), true)
})

test('limited memory, dual-thread CPUs, and budget Intel CPUs use lightweight HUD', () => {
  assert.equal(recommendLightweightHud({ ...desktop, memoryBytes: 4 * 1024 ** 3 }), true)
  assert.equal(recommendLightweightHud({ ...desktop, cpuModels: ['CPU', 'CPU'] }), true)
  assert.equal(
    recommendLightweightHud({
      ...desktop,
      platform: 'win32',
      cpuModels: Array(4).fill('Intel Pentium Silver N5030')
    }),
    true
  )
})

test('ordinary desktops and unknown hardware do not imply low performance', () => {
  assert.equal(recommendLightweightHud(desktop), false)
  assert.equal(recommendLightweightHud({ ...desktop, platform: 'win32' }), false)
  assert.equal(recommendLightweightHud({ ...desktop, memoryBytes: 0, cpuModels: [] }), false)
})

const settingsSource = await readFile(
  new URL('../src/main/game/game-settings.ts', import.meta.url),
  'utf8'
)
const parsed = ts.createSourceFile('game-settings.ts', settingsSource, ts.ScriptTarget.Latest, true)
const setup = parsed.statements
  .find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (decl) => decl.name.getText(parsed) === 'completeGameSetup'
      )
  )
  .getText(parsed)
  .replace(/^export /, '')
const setupCode = ts.transpileModule(setup + '\nglobalThis.runSetup = completeGameSetup', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText

test('setup persists the recommendation, preserves enabled HUD, and leaves Custom unchanged', async () => {
  for (const mode of ['recommended', 'custom']) {
    for (const lowResource of [false, true]) {
      for (const enabled of [false, true]) {
        let saved
        const context = vm.createContext({
          readStoredSettings: async () => ({ lightweightHud: enabled }),
          validateStoredPath: async () => '/test/hl_linux',
          isGoldSrcInstallation: async () => true,
          recommendLightweightHud: () => lowResource,
          resolveVoicePttKeys: async () => ({ team: 'K', party: 'V' }),
          persistResolvedSettings: async (...args) => {
            saved = args[4]
          },
          buildSettings: async (...args) => args[4],
          DEFAULT_CROSSHAIR: {}
        })
        vm.runInContext(setupCode, context)
        const result = await context.runSetup(mode)
        const expected = enabled || (mode === 'recommended' && lowResource)
        assert.equal(saved.lightweightHud, expected)
        assert.equal(result.lightweightHud, expected)
        assert.equal(result.nextClientIntegrationEnabled, mode === 'recommended')
      }
    }
  }
})
