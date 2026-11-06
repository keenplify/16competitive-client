/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build, transform } from 'esbuild'
import { GAME_LAUNCH_PHASES, parseGameLaunchProgress } from '../src/shared/game-launch-progress.ts'
import { launchProgressTranslations } from '../src/renderer/src/features/i18n/launch-progress-translations.ts'

test('launch progress validates helper fields and strips untrusted details', () => {
  for (const phase of GAME_LAUNCH_PHASES) {
    assert.deepEqual(parseGameLaunchProgress({ phase, completed: 2, total: 3, token: 'secret' }), {
      phase,
      completed: 2,
      total: 3
    })
    for (const language of Object.values(launchProgressTranslations))
      assert.ok(language[`launch.progress.${phase}`])
  }
  for (const value of [
    null,
    {},
    { phase: 'private path', completed: 0, total: 1 },
    { phase: 'assets', completed: -1, total: 1 },
    { phase: 'assets', completed: 2, total: 1 },
    { phase: 'assets', completed: 0.5, total: 1 },
    { phase: 'assets', completed: 0, total: Infinity }
  ])
    assert.equal(parseGameLaunchProgress(value), null)
})

test('helper progress advances without committing launch and rejects invalid frames', async () => {
  const source = await readFile('src/main/game/standalone-session.ts', 'utf8')
  const { code } = await transform(
    source.slice(
      source.indexOf("    child.stdout.on('data',"),
      source.indexOf('    child.stdin.write(`${JSON.stringify(request)}')
    ),
    { loader: 'ts' }
  )
  let receive
  const failures = [],
    updates = []
  new Function(
    'child',
    'fail',
    'parseGameLaunchProgress',
    'announceProgress',
    `
    let complete=false, active=null, buffer='', committed=false;
    ${code}
  `
  )(
    {
      stdout: {
        on: (_name, callback) => {
          receive = callback
        }
      }
    },
    (error) => failures.push(error),
    parseGameLaunchProgress,
    (value) => updates.push(value)
  )
  for (const phase of ['checking', 'downloading', 'sticker_bake', 'starting'])
    receive(
      Buffer.from(
        JSON.stringify({
          protocol: 1,
          event: 'progress',
          phase,
          completed: 0,
          total: 1,
          secret: 'private'
        }) + '\n'
      )
    )
  assert.deepEqual(
    updates.map((value) => value.phase),
    ['checking', 'downloading', 'sticker_bake', 'starting']
  )
  assert.equal(failures.length, 0)
  const burst = Array.from(
    { length: 200 },
    () =>
      JSON.stringify({ protocol: 1, event: 'progress', phase: 'assets', completed: 0, total: 1 }) +
      '\n'
  ).join('')
  assert.ok(Buffer.byteLength(burst) > 8192)
  receive(Buffer.from(burst))
  assert.equal(
    failures.length,
    0,
    'a pipe chunk can contain many individually bounded progress frames'
  )
  assert.ok(!JSON.stringify(updates).includes('secret'))
  receive(
    Buffer.from('{"protocol":1,"event":"progress","phase":"ready","completed":0,"total":0}\n')
  )
  assert.equal(failures.length, 1, 'only the validated commit can complete launch')
})

test('early sticker lookup validates recipes, deduplicates artwork and bounds responses', async () => {
  const built = await build({
    entryPoints: ['src/main/game/match-sticker-preload.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm'
  })
  const { matchStickerArtwork } = await import(
    'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
  )
  const previous = globalThis.fetch
  const imagePath = `media/16competitive/stickers/${'a'.repeat(64)}/image.png`
  const recipe = {
    version: 1,
    id: 'a'.repeat(32),
    sourcePath: 'models/16competitive/test/v.mdl',
    sourceSha256: 'a'.repeat(64),
    stickers: [
      {
        imagePath,
        projection: {
          center: [0, 0, 0],
          right: [1, 0, 0],
          up: [0, 1, 0],
          normal: [0, 0, 1],
          size: 0.18,
          angle: 0
        }
      }
    ]
  }
  const run = () =>
    matchStickerArtwork(
      new URL('https://regional.test'),
      'match-id',
      'token',
      new AbortController().signal
    )
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url.origin, 'https://regional.test')
      assert.equal(options.headers.authorization, 'Bearer token')
      return Response.json({ recipes: [recipe, { ...recipe, id: 'b'.repeat(32) }] })
    }
    assert.deepEqual(await run(), [imagePath])
    for (const response of [
      Response.json({ recipes: [{ ...recipe, sourcePath: '../escape' }] }),
      new Response('x'.repeat(128 * 1024 + 1))
    ]) {
      globalThis.fetch = async () => response
      await assert.rejects(run())
    }
    globalThis.fetch = async () => new Response('', { status: 404 })
    assert.deepEqual(await run(), [])
  } finally {
    globalThis.fetch = previous
  }
})
