/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { packageRendererUpdate } from './package-renderer-update.mjs'
import { signRendererUpdate } from './sign-renderer-update.mjs'
import { verifyRendererEnvelope } from '../src/shared/renderer-update.ts'
const asar = createRequire(import.meta.url)('@electron/asar')

test('renderer packaging excludes executable code; main/preload/native/dependency/Electron changes require a full install', async () => {
  const root = await mkdtemp(join(tmpdir(), '16c-renderer-package-test-'))
  try {
    const source = join(root, 'source'),
      output = join(root, 'dist'),
      app = join(root, 'app'),
      resources = join(app, 'resources')
    for (const name of ['out/main', 'out/preload', 'out/renderer/assets', 'node_modules/example'])
      await mkdir(join(source, name), { recursive: true })
    await mkdir(join(resources, 'native'), { recursive: true })
    await mkdir(output)
    const pkg = { name: '16competitive-client', version: '2026.1016.1', main: 'out/main/index.js' }
    await writeFile(join(source, 'package.json'), JSON.stringify(pkg))
    await writeFile(join(source, 'out/main/index.js'), 'main process')
    await writeFile(join(source, 'out/preload/index.js'), 'secure preload')
    await writeFile(join(source, 'node_modules/example/index.js'), 'dependency')
    await writeFile(
      join(source, 'out/renderer/index.html'),
      '<script src="./assets/app.js"></script>'
    )
    await writeFile(join(source, 'out/renderer/assets/app.js'), 'renderer one')
    await writeFile(join(resources, 'native/helper.exe'), 'native helper')
    const build = async (electron = '39.2.6') => {
      await asar.createPackage(source, join(resources, 'app.asar'))
      asar.uncacheAll()
      await packageRendererUpdate(app, 'x64', electron, output)
      return JSON.parse(
        await readFile(join(output, 'renderer-update-win-x64.unsigned.json'), 'utf8')
      )
    }
    const initial = await build()
    await writeFile(join(source, 'out/renderer/assets/app.js'), 'renderer two')
    await writeFile(
      join(source, 'package.json'),
      JSON.stringify({ ...pkg, version: '2026.1016.2' })
    )
    const ui = await build()
    assert.equal(ui.compatibility, initial.compatibility)
    assert.notEqual(ui.sha256, initial.sha256)
    assert.deepEqual(
      asar
        .listPackage(join(output, ui.file))
        .map((name) => name.replaceAll('\\', '/'))
        .sort(),
      ['/assets', '/assets/app.js', '/index.html']
    )
    for (const name of [
      'out/main/index.js',
      'out/preload/index.js',
      'node_modules/example/index.js'
    ]) {
      const original = await readFile(join(source, name))
      await writeFile(join(source, name), 'changed')
      assert.notEqual((await build()).compatibility, initial.compatibility)
      await writeFile(join(source, name), original)
    }
    assert.notEqual((await build('40.0.0')).compatibility, initial.compatibility)
    await writeFile(join(resources, 'native/helper.exe'), 'new helper')
    assert.notEqual((await build()).compatibility, initial.compatibility)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const signedPath = await signRendererUpdate(output, root, '2026.1016.2', privateKey, pem)
    assert.equal(
      verifyRendererEnvelope(JSON.parse(await readFile(signedPath, 'utf8')), pem).version,
      '2026.1016.2'
    )
    await writeFile(join(output, ui.file), 'tampered')
    await assert.rejects(signRendererUpdate(output, root, '2026.1016.2', privateKey, pem))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
