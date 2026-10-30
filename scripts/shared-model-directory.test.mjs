import vm from 'node:vm'
import ts from 'typescript'
import * as path from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  gameStorageError,
  ensureSharedModelDirectory,
  managedAssetDestination
} from '../src/main/game/shared-model-directory.ts'

test('both game versions share models, preserve migration originals and reuse the same target', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-shared-models-'))
  try {
    const a = join(root, 'cstrike'),
      b = join(root, 'cstrk13'),
      shared = join(root, 'shared')
    await mkdir(join(a, 'models/16competitive/knife/hash'), { recursive: true })
    await mkdir(b)
    await writeFile(join(a, 'models/16competitive/knife/hash/v.mdl'), 'original-model')
    await ensureSharedModelDirectory(a, shared)
    await ensureSharedModelDirectory(b, shared)
    await ensureSharedModelDirectory(a, shared)
    assert.equal(await realpath(join(a, 'models/16competitive')), shared)
    assert.equal(await realpath(join(b, 'models/16competitive')), shared)
    const destination = await managedAssetDestination(shared, 'knife/hash/p.mdl')
    await writeFile(destination, 'held-model')
    assert.equal(
      await readFile(join(b, 'models/16competitive/knife/hash/p.mdl'), 'utf8'),
      'held-model'
    )
    assert.equal(
      await readFile(join(a, 'models/16competitive/knife/hash/v.mdl'), 'utf8'),
      'original-model'
    )
    assert.equal(
      (await readdir(join(a, 'models'))).filter((name) => name.includes('.before-shared-')).length,
      1
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('conflicts, unknown entries and unexpected links preserve the original directories', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-model-conflicts-'))
  try {
    const game = join(root, 'game'),
      shared = join(root, 'shared')
    await mkdir(join(game, 'models/16competitive'), { recursive: true })
    await mkdir(shared)
    await writeFile(join(game, 'models/16competitive/v.mdl'), 'player-change')
    await writeFile(join(shared, 'v.mdl'), 'different')
    await assert.rejects(ensureSharedModelDirectory(game, shared), /Conflicting/)
    assert.equal(await readFile(join(game, 'models/16competitive/v.mdl'), 'utf8'), 'player-change')
    await symlink(root, join(shared, 'escape'), 'dir')
    await assert.rejects(managedAssetDestination(shared, 'escape/file.mdl'), /Unexpected link/)
    await symlink(join(shared, 'v.mdl'), join(shared, 'linked.mdl'))
    await assert.rejects(managedAssetDestination(shared, 'linked.mdl'), /Unexpected managed/)
    for (const path of ['../outside.mdl', '/absolute.mdl', 'safe/../../outside.mdl', 'a\\b.mdl'])
      await assert.rejects(managedAssetDestination(shared, path), /Unsafe|escapes/)
    const other = join(root, 'other')
    await mkdir(join(other, 'models'), { recursive: true })
    await symlink(root, join(other, 'models/16competitive'), 'dir')
    await assert.rejects(ensureSharedModelDirectory(other, shared), /unexpected target/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('denied filesystem operations retain their cause and produce actionable guidance', () => {
  for (const code of ['EPERM', 'EACCES', 'EROFS']) {
    const cause = Object.assign(new Error('filesystem failure'), { code })
    const error = gameStorageError(cause)
    assert.equal(error.message, 'match.assets.storageDenied')
    assert.equal(error.cause, cause)
  }
  const unsafe = new Error('Unexpected link')
  assert.equal(gameStorageError(unsafe), unsafe)
})

for (const game of ['cs13', 'cs16']) {
  test(`${game} storage never probes or modifies the other installation`, async () => {
    const roots = []
    const context = vm.createContext({ process: { platform: 'win32', env: {} } })
    const source = ts.transpileModule(
      await readFile(new URL('../src/main/game/shared-skin-storage.ts', import.meta.url), 'utf8'),
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
    ).outputText
    const dependencies = {
      electron: { app: { getPath: () => '/user-data' } },
      'node:path': path,
      './game-settings': {
        getSavedCs16Executable: async () => {
          assert.equal(game, 'cs16', 'CS13 must not inspect CS16 settings')
          return '/cs16/hl.exe'
        }
      },
      './game-directory': { ensureLauncherContentDirectory: async () => '/cs16/cstrike' },
      './legacy-game-service': {
        LegacyGameService: class {
          // JavaScript VM fixture; return type is inferred.
          // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
          async get() {
            assert.equal(game, 'cs13', 'CS16 must not validate CS13')
            return { ok: true, value: { installation: { gameDirectory: '/cs13/cstrike' } } }
          }
        }
      },
      './shared-model-directory': {
        ensureSharedModelDirectory: async (root) => {
          roots.push(root)
        },
        managedAssetDestination: async (root, file) => path.join(root, file)
      }
    }
    const module = new vm.SourceTextModule(source, { context })
    await module.link((name) => {
      const exports = dependencies[name]
      assert.ok(exports, name)
      return new vm.SyntheticModule(
        Object.keys(exports),
        function () {
          for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
        },
        { context }
      )
    })
    await module.evaluate()
    const storage = await module.namespace.prepareSkinStorage(game)
    assert.equal(storage.contentRoot, `/${game}/cstrike`)
    assert.deepEqual(roots, [`/${game}/cstrike`])
    assert.equal(
      await storage.destination('models/16competitive/knife/v.mdl'),
      '/user-data/game-assets/models/16competitive/knife/v.mdl'
    )
  })
}
