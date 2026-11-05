/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const hash = (b) => createHash('sha256').update(b).digest('hex')
test('verified sticker artifacts survive reconnects, coalesce misses and rebuild changed pixels', async () => {
  const dir = await mkdtemp(join(tmpdir(), '16c-sticker-cache-'))
  try {
    const file = join(dir, 'cache.mjs')
    await build({
      entryPoints: ['src/main/game/sticker-artifact-cache.ts'],
      outfile: file,
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent'
    })
    const source = new Uint8Array([1, 2, 3]),
      bytes = new Uint8Array([4, 5, 6]),
      textureBytes = new Uint8Array([7, 8, 9])
    const content = {
      version: 1,
      sourcePath: 'models/16competitive/test/v.mdl',
      sourceSha256: hash(source),
      stickers: [
        {
          imagePath: 'media/16competitive/stickers/' + hash(source) + '/image.png',
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
    const recipe = { ...content, id: hash(JSON.stringify(content)).slice(0, 32) }
    let bakes = 0
    const produce = async () => {
      bakes++
      return {
        recipeId: recipe.id,
        sourcePath: content.sourcePath,
        bytes,
        sha256: hash(bytes),
        textureBytes,
        textureSha256: hash(textureBytes)
      }
    }
    const { cachedStickerArtifact } = await import(pathToFileURL(file))
    const directory = join(dir, 'artifacts')
    const first = await Promise.all(
      Array.from({ length: 5 }, () => cachedStickerArtifact(directory, recipe, source, produce))
    )
    assert.equal(bakes, 1, 'concurrent staging shares one bake')
    assert.deepEqual(first[0], first[4])
    // New module instance models a launcher restart; only on-disk state is shared.
    const restarted = await import(pathToFileURL(file).href + '?restart')
    assert.deepEqual(
      await restarted.cachedStickerArtifact(directory, recipe, source, produce),
      first[0]
    )
    assert.equal(bakes, 1, 'reconnect/restart must not recalculate pixels')
    await writeFile(join(directory, hash(textureBytes).slice(0, 32) + '.rgba'), 'changed')
    await restarted.cachedStickerArtifact(directory, recipe, source, produce)
    assert.equal(bakes, 2, 'modified saved pixels must be rebuilt')
    await assert.rejects(
      cachedStickerArtifact(directory, recipe, new Uint8Array([9]), produce),
      /RECIPE_INVALID/
    )
    await assert.rejects(
      cachedStickerArtifact(directory, { ...recipe, id: '0'.repeat(32) }, source, produce),
      /RECIPE_INVALID/
    )
    assert.equal(bakes, 2, 'cache does not bypass input integrity checks')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
