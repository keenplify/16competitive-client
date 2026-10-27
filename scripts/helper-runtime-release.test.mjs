/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { generateKeyPairSync, verify } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { packageHelperRuntime } from './package-helper-runtime.mjs'
import { signHelperRuntimes, helperRuntimeAssets } from './sign-helper-runtime.mjs'
const asar = createRequire(import.meta.url)('@electron/asar')

test('runtime releases bind the exact archive and file inventory to the pinned signature context', async () => {
  const root = await mkdtemp(join(tmpdir(), 'helper-runtime-release-'))
  const unpacked = join(root, 'unpacked')
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const { version } = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  )
  try {
    await mkdir(join(unpacked, 'resources', 'scoreboard'), { recursive: true })
    await mkdir(join(unpacked, 'resources', 'native'), { recursive: true })
    await writeFile(join(unpacked, 'resources', 'native', 'game-inspector'), 'native fixture')
    const app = join(root, 'source-app')
    for (const name of ['out/main', 'out/renderer', 'node_modules/test-dep', 'web-helper/target'])
      await mkdir(join(app, name), { recursive: true })
    await writeFile(
      join(app, 'package.json'),
      JSON.stringify({ name: '16competitive-client', version, main: 'out/main/index.js' })
    )
    await writeFile(join(app, 'out/main/index.js'), 'console.log("runtime")')
    await writeFile(join(app, 'node_modules/test-dep/index.js'), 'module.exports=1')
    await writeFile(join(app, 'out/renderer/desktop-only.js'), 'desktop-only')
    await writeFile(join(app, 'web-helper/target/build-only'), 'build-only')
    await asar.createPackage(app, join(unpacked, 'resources', 'app.asar'))
    await writeFile(join(unpacked, '16competitive-client'), 'runtime')
    await writeFile(join(unpacked, '16competitive-client.exe'), 'runtime')
    await writeFile(
      join(unpacked, 'resources', 'scoreboard', 'index.html'),
      '<div>existing renderer</div>'
    )
    for (const platform of ['win', 'linux']) {
      const manifest = await packageHelperRuntime(unpacked, root, platform)
      assert.equal(manifest.version, version)
      assert.ok(manifest.files['resources/scoreboard/index.html'])
      const extracted = join(root, `extracted-${platform}`)
      await mkdir(extracted)
      execFileSync(process.platform === 'win32' ? 'tar.exe' : 'tar', [
        '-xzf',
        join(root, manifest.fileName),
        '-C',
        extracted
      ])
      const contents = asar
        .listPackage(join(extracted, 'resources', 'app.asar'))
        .map((name) => name.replace(/\\/g, '/'))
      assert.ok(contents.includes('/out/main/index.js'))
      assert.ok(contents.includes('/node_modules/test-dep/index.js'))
      assert.ok(
        !contents.some((name) => name.startsWith('/out/renderer') || name.startsWith('/web-helper'))
      )
    }
    const paths = await signHelperRuntimes(root, root, version, privateKey, publicKey)
    for (const path of paths) {
      const envelope = JSON.parse(await readFile(path, 'utf8'))
      assert.ok(
        verify(
          null,
          Buffer.from('16competitive.helper-runtime.v1\n' + envelope.manifest),
          publicKey,
          Buffer.from(envelope.signature, 'base64')
        )
      )
      assert.ok(
        !verify(
          null,
          Buffer.from('16competitive.web-helper.update.v1\n' + envelope.manifest),
          publicKey,
          Buffer.from(envelope.signature, 'base64')
        )
      )
    }
    await writeFile(join(root, helperRuntimeAssets[0]), 'tampered')
    await assert.rejects(
      signHelperRuntimes(root, root, version, privateKey, publicKey),
      /does not match/
    )
    if (process.platform !== 'win32') {
      await symlink(join(unpacked, '16competitive-client'), join(unpacked, 'injected-link'))
      await assert.rejects(packageHelperRuntime(unpacked, root, 'linux'), /cannot contain links/)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
