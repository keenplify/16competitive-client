/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import vm from 'node:vm'
import ts from 'typescript'
import * as protocol from '../src/shared/renderer-update.ts'
import { updateRecoveryTranslations } from '../src/shared/update-recovery-translations.ts'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const bytes = Buffer.from('verified renderer archive')
const compatibility = 'a'.repeat(64)
function envelope(patch = {}) {
  const manifest = JSON.stringify({
    format: 1,
    version: '2026.1016.2',
    platform: 'win32',
    arch: 'x64',
    compatibility,
    file: '16competitive-client-2026.1016.2-renderer-win-x64.asar',
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ...patch
  })
  return {
    manifest,
    signature: sign(
      null,
      Buffer.from(protocol.rendererUpdateContext + manifest),
      privateKey
    ).toString('base64')
  }
}

test('renderer manifests require publisher signatures, bounded sizes, exact release names and matching bytes', () => {
  const good = envelope()
  const parsed = protocol.verifyRendererEnvelope(good, pem)
  protocol.verifyRendererBytes(bytes, parsed)
  assert.throws(() => protocol.verifyRendererBytes(Buffer.from('modified'), parsed))
  assert.throws(() =>
    protocol.verifyRendererEnvelope({ ...good, manifest: good.manifest + ' ' }, pem)
  )
  for (const patch of [
    { file: '../escape.asar' },
    { size: 0 },
    { size: protocol.maxRendererUpdateBytes + 1 },
    { arch: 'ia32' },
    { compatibility: 'bad' },
    { version: 'bad' }
  ])
    assert.throws(() => protocol.verifyRendererEnvelope(envelope(patch), pem))
  const otherKey = generateKeyPairSync('ed25519')
    .publicKey.export({ type: 'spki', format: 'pem' })
    .toString()
  assert.throws(() => protocol.verifyRendererEnvelope(good, otherKey))
  assert.equal(protocol.newerVersion('2026.1016.10', '2026.1016.2'), true)
  assert.equal(protocol.newerVersion('../bad', '2026.1016.2'), false)
})

const source = ts.transpileModule(
  await fsp.readFile(new URL('../src/main/renderer-updates.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
).outputText
async function harness(root, { signed = envelope(), payload = bytes } = {}) {
  const resources = path.join(root, 'resources')
  await fsp.mkdir(resources, { recursive: true })
  await fsp.writeFile(
    path.join(resources, 'renderer-runtime.json'),
    JSON.stringify({ compatibility })
  )
  const context = vm.createContext({
    console,
    Buffer,
    AbortSignal,
    process: { platform: 'win32', arch: 'x64', resourcesPath: resources },
    fetch: async (url) => (url.endsWith('.json') ? Response.json(signed) : new Response(payload))
  })
  const dependencies = {
    electron: { app: { isPackaged: true, getPath: () => root, getVersion: () => '2026.1016.1' } },
    'node:crypto': crypto,
    'node:fs': fs,
    'node:fs/promises': fsp,
    'node:path': path,
    '../../helper-release.json': { default: { publicKeyPem: pem } },
    '../shared/renderer-update': protocol
  }
  const module = new vm.SourceTextModule(source, { context })
  await module.link((name) => {
    const values = dependencies[name]
    return new vm.SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  return module.namespace
}

test('renderer downloads stage atomically, confirm a successful launch and persist without modifying the installed runtime', async () => {
  const root = await fsp.mkdtemp(path.join(tmpdir(), '16c-renderer-'))
  try {
    const h = await harness(root)
    assert.equal(await h.stageRendererUpdate('2026.1016.2', () => {}), true)
    const entry = h.selectRendererEntry('/installed/index.html')
    assert.match(entry, /\.asar[/\\]index.html$/)
    assert.equal(h.effectiveClientVersion(), '2026.1016.2')
    h.confirmRendererStartup()
    const next = await harness(root)
    assert.equal(next.selectRendererEntry('/installed/index.html'), entry)
    assert.deepEqual(await fsp.readdir(path.join(root, 'resources')), ['renderer-runtime.json'])
    assert.equal(
      (await fsp.readdir(path.join(root, 'renderer-updates'))).some((name) =>
        name.endsWith('.tmp')
      ),
      false
    )
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('an unconfirmed renderer rolls back next launch and is not automatically retried', async () => {
  const root = await fsp.mkdtemp(path.join(tmpdir(), '16c-renderer-rollback-'))
  try {
    const h = await harness(root)
    await h.stageRendererUpdate('2026.1016.2', () => {})
    h.selectRendererEntry('/installed/index.html')
    const next = await harness(root)
    assert.equal(next.selectRendererEntry('/installed/index.html'), '/installed/index.html')
    assert.equal(await next.stageRendererUpdate('2026.1016.2', () => {}), false)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('native/runtime differences fall back to the installer; tampering fails closed and cleans partial files', async () => {
  const root = await fsp.mkdtemp(path.join(tmpdir(), '16c-renderer-tamper-'))
  try {
    const mismatch = await harness(root, { signed: envelope({ compatibility: 'b'.repeat(64) }) })
    assert.equal(await mismatch.stageRendererUpdate('2026.1016.2', () => {}), false)
    for (const payload of [Buffer.from('short'), Buffer.alloc(bytes.length + 1)]) {
      const bad = await harness(root, { payload })
      await assert.rejects(bad.stageRendererUpdate('2026.1016.2', () => {}))
      assert.equal((await fsp.readdir(path.join(root, 'renderer-updates'))).length, 0)
    }
    const good = await harness(root)
    await good.stageRendererUpdate('2026.1016.2', () => {})
    const name = (await fsp.readdir(path.join(root, 'renderer-updates'))).find((name) =>
      name.endsWith('.asar')
    )
    await fsp.writeFile(path.join(root, 'renderer-updates', name), 'tampered')
    assert.equal(good.selectRendererEntry('/installed/index.html'), '/installed/index.html')
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('recovery instructions and actions exist in every supported language', () => {
  assert.deepEqual(
    Object.keys(updateRecoveryTranslations).sort(),
    ['en', 'tl', 'ru', 'th', 'id', 'hi', 'pt', 'ja'].sort()
  )
  const keys = Object.keys(updateRecoveryTranslations.en).sort()
  for (const copy of Object.values(updateRecoveryTranslations)) {
    assert.deepEqual(Object.keys(copy).sort(), keys)
    for (const text of Object.values(copy)) assert.ok(text.trim())
  }
})

test('installer recovery persists an unfinished attempt and clears it after a successful native update', async () => {
  const root = await fsp.mkdtemp(path.join(tmpdir(), '16c-install-recovery-'))
  try {
    let version = '2026.1016.1'
    const recoverySource = ts.transpileModule(
      await fsp.readFile(new URL('../src/main/update-recovery.ts', import.meta.url), 'utf8'),
      {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
      }
    ).outputText
    const context = vm.createContext({ console })
    const dependencies = {
      electron: { app: { getPath: () => root, getVersion: () => version } },
      'node:fs': fs,
      'node:path': path,
      '../shared/renderer-update': protocol
    }
    const module = new vm.SourceTextModule(recoverySource, { context })
    await module.link((name) => {
      const values = dependencies[name]
      return new vm.SyntheticModule(
        Object.keys(values),
        function () {
          for (const [key, value] of Object.entries(values)) this.setExport(key, value)
        },
        { context }
      )
    })
    await module.evaluate()
    const h = module.namespace
    assert.equal(h.unfinishedInstallerVersion(), null)
    h.recordInstallerAttempt('2026.1016.2')
    assert.equal(h.unfinishedInstallerVersion(), '2026.1016.2')
    version = '2026.1016.2'
    assert.equal(h.unfinishedInstallerVersion(), null)
    assert.equal(fs.existsSync(path.join(root, 'pending-launcher-install.json')), false)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})
