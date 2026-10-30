/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { tmpdir } from 'node:os'
import vm from 'node:vm'
import ts from 'typescript'
import {
  isBundledPingAssetPath,
  BUNDLED_PING_ASSET_PATHS,
  versionedGameAssetHash
} from '../src/shared/game-asset-path.ts'

const source = ts.transpileModule(
  await fs.readFile(new URL('../src/main/game/match-assets.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }
).outputText

async function harness(assets, bytes, failures = []) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), '16c-smoke-loader-'))
  const root = path.join(directory, 'cstrike')
  await fs.mkdir(root)
  const requests = []
  const progress = []
  const context = vm.createContext({
    Buffer,
    URL,
    AbortSignal,
    AbortController,
    setTimeout: (callback) => {
      queueMicrotask(callback)
      return 0
    },
    process: { env: {} },
    console: {
      info: () => undefined,
      debug: () => undefined,
      warn: () => undefined,
      error: () => undefined
    },
    fetch: async (url, options) => {
      assert.equal(options.headers.authorization, 'Bearer fixture-token')
      const target = new URL(url)
      requests.push(target)
      const failure = failures.shift()
      if (failure === 'network') throw new TypeError('fetch failed')
      if (typeof failure === 'number') return new Response('', { status: failure })
      if (target.pathname.endsWith('/manifest') || target.pathname.endsWith('/assets'))
        return Response.json({ assets })
      // Deliberately omit Content-Length, as valid streamed regional responses may do.
      return new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })
    }
  })
  const dependencies = {
    'node:crypto': crypto,
    'node:fs/promises': fs,
    'node:path': path,
    '../auth': { getSessionToken: () => 'fixture-token' },
    './shared-skin-storage': {
      prepareSkinStorage: async () => ({
        contentRoot: root,
        destination: async (asset) => path.join(root, asset)
      })
    },
    '../../shared/game-asset-path': { isBundledPingAssetPath, versionedGameAssetHash }
  }
  const module = new vm.SourceTextModule(source, { context })
  await module.link(async (name) => {
    const exports = dependencies[name]
    assert.ok(exports, `Unexpected dependency: ${name}`)
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
      },
      { context }
    )
  })
  await module.evaluate()
  return {
    api: module.namespace,
    root,
    requests,
    progress,
    cleanup: () => fs.rm(directory, { recursive: true, force: true })
  }
}

const matchId = '12345678-1234-4123-8123-123456789abc'
// Small complete GoldSrc v2 sprite with a one-color palette and one 2x2 frame.
const sprite = Buffer.alloc(42 + 3 + 4 + 16 + 4)
sprite.write('IDSP')
sprite.writeInt32LE(2, 4)
sprite.writeInt32LE(2, 20)
sprite.writeInt32LE(2, 24)
sprite.writeInt32LE(1, 28)
sprite.writeUInt16LE(1, 40)
sprite.writeInt32LE(2, 57)
sprite.writeInt32LE(2, 61)
const sha256 = crypto.createHash('sha256').update(sprite).digest('hex')

test('Music Kit manifests accept only their versioned audio WAV paths', () => {
  const hash = '47688106b8edd1ba59da8eeb9d5379a8'
  assert.equal(versionedGameAssetHash(`sound/16competitive/music/${hash}/audio.wav`), hash)
  for (const unsafe of [
    `sound/16competitive/music/${hash}/../audio.wav`,
    `/sound/16competitive/music/${hash}/audio.wav`,
    `sound\\16competitive\\music\\${hash}\\audio.wav`,
    `sound/16competitive/music/${hash.slice(0, 16)}/audio.wav`,
    `sound/16competitive/music/${hash.repeat(2)}/audio.wav`,
    `sound/16competitive/music/${hash}/other.wav`,
    `sound/16competitive/music/${hash}/audio.exe`,
    `sound/16competitive/knife/${hash}/audio.wav`
  ])
    assert.equal(versionedGameAssetHash(unsafe), null, unsafe)
})

test('Music Kit WAVs preload before launch, verify the full manifest hash and reuse the cache', async () => {
  const bytes = Buffer.alloc(48)
  bytes.write('RIFF')
  bytes.writeUInt32LE(40, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(22050, 24)
  bytes.writeUInt32LE(44100, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(4, 40)
  const hash = crypto.createHash('sha256').update(bytes).digest('hex')
  const asset = { path: `sound/16competitive/music/${hash.slice(0, 32)}/audio.wav`, sha256: hash }
  const h = await harness([asset], bytes)
  try {
    const preload = () =>
      h.api.startMatchAssetPreload(matchId, 'https://backend.example.test', (value) =>
        h.progress.push(value)
      )
    await preload()
    assert.deepEqual(await fs.readFile(path.join(h.root, asset.path)), bytes)
    assert.equal(h.progress.at(-1).status, 'ready')
    h.api.clearMatchAssetPreload(matchId)
    await preload()
    assert.equal(h.requests.filter((url) => url.pathname.endsWith('/file')).length, 1)
    await fs.writeFile(path.join(h.root, asset.path), Buffer.alloc(bytes.length))
    h.api.clearMatchAssetPreload(matchId)
    await preload()
    assert.deepEqual(await fs.readFile(path.join(h.root, asset.path)), bytes)
    assert.equal(h.requests.filter((url) => url.pathname.endsWith('/file')).length, 2)
  } finally {
    await h.cleanup()
  }
  const badHash = hash.slice(0, 32) + (hash[32] === '0' ? '1' : '0') + hash.slice(33)
  const corrupt = await harness([{ ...asset, sha256: badHash }], bytes)
  try {
    await assert.rejects(
      corrupt.api.startMatchAssetPreload(matchId, 'https://backend.example.test'),
      /integrity check failed/
    )
    assert.equal(await fs.stat(path.join(corrupt.root, asset.path)).catch(() => null), null)
  } finally {
    await corrupt.cleanup()
  }
})

test('allows the real default smoke path and versioned custom effects, rejecting path escapes and wrong types', () => {
  assert.equal(
    versionedGameAssetHash('sprites/16competitive/system/786058016e710e19/gas.spr'),
    '786058016e710e19'
  )
  assert.equal(
    versionedGameAssetHash(`sprites/16competitive/smokegrenade/${sha256.slice(0, 16)}/e.spr`),
    sha256.slice(0, 16)
  )
  for (const unsafe of [
    `sprites/16competitive/system/${sha256}/../gas.spr`,
    `/sprites/16competitive/system/${sha256}/gas.spr`,
    `sprites\\16competitive\\system\\${sha256}\\gas.spr`,
    `models/16competitive/system/${sha256}/gas.spr`,
    `sprites/16competitive/smokegrenade/${sha256}/gas.spr`,
    'sprites/gas_puff_01.spr'
  ])
    assert.equal(versionedGameAssetHash(unsafe), null, unsafe)
})

test('match preparation installs default and custom smoke sprites, verifies hashes, repairs corruption and reuses cache', async () => {
  const assets = [
    { path: `sprites/16competitive/system/${sha256.slice(0, 16)}/gas.spr`, sha256 },
    { path: `sprites/16competitive/smokegrenade/${sha256.slice(0, 16)}/e.spr`, sha256 }
  ]
  const h = await harness(assets, sprite)
  try {
    const run = () =>
      h.api.startMatchAssetPreload(matchId, 'https://backend.example.test', (value) =>
        h.progress.push(value)
      )
    await run()
    for (const asset of assets)
      assert.deepEqual(await fs.readFile(path.join(h.root, asset.path)), sprite)
    assert.equal(h.requests.filter((url) => url.pathname.endsWith('/file')).length, 2)
    assert.equal(h.progress.at(-1).status, 'ready')
    assert.equal(h.progress.at(-1).completedFiles, 2)
    h.api.clearMatchAssetPreload(matchId)
    await run()
    assert.equal(h.requests.filter((url) => url.pathname.endsWith('/file')).length, 2)
    await fs.writeFile(path.join(h.root, assets[0].path), Buffer.alloc(sprite.length))
    h.api.clearMatchAssetPreload(matchId)
    await run()
    assert.equal(h.requests.filter((url) => url.pathname.endsWith('/file')).length, 3)
    assert.deepEqual(await fs.readFile(path.join(h.root, assets[0].path)), sprite)
  } finally {
    await h.cleanup()
  }
})

test('all bundled ping resources are verified and cached before legacy match readiness', async () => {
  for (const key of BUNDLED_PING_ASSET_PATHS) {
    const bytes = Buffer.alloc(64)
    bytes.write(key.endsWith('.mdl') ? 'IDST' : 'RIFF')
    if (key.endsWith('.wav')) bytes.write('WAVE', 8)
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    const h = await harness([{ path: key, sha256: hash }], bytes)
    try {
      const run = () =>
        h.api.startMatchAssetPreload(
          matchId,
          'https://backend.example.test',
          (value) => h.progress.push(value),
          'cs13'
        )
      await run()
      assert.deepEqual(await fs.readFile(path.join(h.root, key)), bytes)
      assert.equal(h.progress.at(-1).status, 'ready')
      assert.equal(h.requests.filter((url) => url.pathname.endsWith('/file')).length, 1)
      h.api.clearMatchAssetPreload(matchId)
      await run()
      assert.equal(h.requests.filter((url) => url.pathname.endsWith('/file')).length, 1)
    } finally {
      await h.cleanup()
    }
  }
})

test('fixed ping paths require full hashes and reject unknown or traversing paths before download', async () => {
  for (const asset of [
    { path: BUNDLED_PING_ASSET_PATHS[0] },
    { path: 'models/16competitive/ping/v2/unknown.mdl', sha256 },
    { path: 'models/16competitive/ping/v2/../ef_gundrop.mdl', sha256 }
  ]) {
    const h = await harness([asset], sprite)
    try {
      await assert.rejects(
        h.api.startMatchAssetPreload(matchId, 'https://backend.example.test'),
        /manifest is invalid|unsafe asset path/
      )
      assert.equal(h.requests.filter((url) => url.pathname.endsWith('/file')).length, 0)
    } finally {
      await h.cleanup()
    }
  }
})

test('catalog synchronization includes the default smoke sprite too', async () => {
  const asset = { path: `sprites/16competitive/system/${sha256.slice(0, 16)}/gas.spr`, sha256 }
  const h = await harness([asset], sprite)
  try {
    await h.api.startSkinAssetSync('https://backend.example.test', (value) =>
      h.progress.push(value)
    )
    assert.deepEqual(await fs.readFile(path.join(h.root, asset.path)), sprite)
    assert.equal(h.progress.at(-1).status, 'ready')
  } finally {
    await h.cleanup()
  }
})

test('mismatched manifest hashes and duplicate destinations never start downloads', async () => {
  const asset = { path: `sprites/16competitive/system/${sha256.slice(0, 16)}/gas.spr`, sha256 }
  for (const assets of [[{ ...asset, sha256: '0'.repeat(64) }], [asset, asset]]) {
    const h = await harness(assets, sprite)
    try {
      await assert.rejects(
        h.api.startMatchAssetPreload(matchId, 'https://backend.example.test'),
        /hash does not match|duplicate asset/
      )
      assert.equal(h.requests.filter((url) => url.pathname.endsWith('/file')).length, 0)
      assert.equal(
        h.progress.some((value) => value.status === 'ready'),
        false
      )
    } finally {
      await h.cleanup()
    }
  }
})

test('corrupt downloaded sprite bytes never reach the game directory or ready state', async () => {
  const asset = { path: `sprites/16competitive/system/${sha256.slice(0, 16)}/gas.spr`, sha256 }
  const corrupted = Buffer.from(sprite)
  corrupted[corrupted.length - 1] = 1
  const h = await harness([asset], corrupted)
  try {
    await assert.rejects(
      h.api.startMatchAssetPreload(matchId, 'https://backend.example.test'),
      /integrity check failed/
    )
    await assert.rejects(fs.stat(path.join(h.root, asset.path)), { code: 'ENOENT' })
    assert.equal(
      h.progress.some((value) => value.status === 'ready'),
      false
    )
  } finally {
    await h.cleanup()
  }
})

test('catalog retries transient connection and service errors then completes', async () => {
  const h = await harness([], Buffer.alloc(0), ['network', 503])
  try {
    await h.api.startSkinAssetSync('https://regional.example', (value) => h.progress.push(value))
    assert.equal(h.requests.length, 3)
    assert.equal(h.progress.at(-1).status, 'ready')
  } finally {
    await h.cleanup()
  }
})

test('catalog stops after three temporary failures', async () => {
  const h = await harness([], Buffer.alloc(0), [503, 503, 503, 503])
  try {
    await assert.rejects(
      h.api.startSkinAssetSync('https://regional.example', (value) => h.progress.push(value))
    )
    assert.equal(h.requests.length, 3)
    assert.equal(h.progress.at(-1).status, 'error')
  } finally {
    await h.cleanup()
  }
})

test('catalog does not retry authorization failures', async () => {
  const h = await harness([], Buffer.alloc(0), [403])
  try {
    await assert.rejects(h.api.startSkinAssetSync('https://regional.example', () => {}))
    assert.equal(h.requests.length, 1)
  } finally {
    await h.cleanup()
  }
})
