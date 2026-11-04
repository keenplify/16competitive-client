/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test, after } from 'node:test'
import { build } from 'esbuild'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  isHandTexture,
  modelTextures,
  bakeSticker,
  testSticker,
  texturePixels
} from '../src/shared/sticker-model.ts'

const temp = await mkdtemp(path.join(os.tmpdir(), 'sticker-tests-'))
after(() => rm(temp, { recursive: true, force: true }))
const contractsPath = path.join(temp, 'contracts.mjs')
await build({
  entryPoints: [new URL('../src/shared/stickers.ts', import.meta.url).pathname],
  outfile: contractsPath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent'
})
const { parseStickerSnapshot, parseStickerProjection } = await import(
  pathToFileURL(contractsPath).href
)
const modulePath = path.join(temp, 'atlas.mjs')
await build({
  entryPoints: [
    new URL('../src/renderer/src/libs/web-hlmv/lib/sticker-atlas.ts', import.meta.url).pathname
  ],
  outfile: modulePath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent'
})
const {
  bakeProjectedSticker,
  validateProjection,
  prepareStickerAtlas,
  validateStudioNormalLayout,
  validateStudioTextureLayout,
  bakeProjectedStickers,
  fullColorStickerTextures
} = await import(pathToFileURL(modulePath).href)

test('GoldSrc split meshes consume their shared normal array once, not once per texture page', () => {
  const bytes = new Uint8Array(1024),
    view = new DataView(bytes.buffer)
  const put = (at, value) => view.setInt32(at, value, true)
  put(204, 1)
  put(208, 244)
  put(244 + 64, 1)
  put(244 + 72, 320)
  put(320 + 72, 2)
  put(320 + 76, 432)
  put(320 + 92, 4)
  put(432 + 12, 4)
  put(452 + 12, 4)
  assert.throws(() => validateStudioNormalLayout(bytes), /model/)
  put(452 + 12, 0)
  assert.doesNotThrow(() => validateStudioNormalLayout(bytes))
  put(432 + 12, 3)
  assert.throws(() => validateStudioNormalLayout(bytes), /model/)
})

function fixture(count = 2, size = 512) {
  const table = 244,
    start = table + count * 80,
    span = size * size + 768
  const bytes = new Uint8Array(start + count * span),
    view = new DataView(bytes.buffer)
  view.setUint32(0, 0x54534449, true)
  view.setInt32(4, 10, true)
  view.setInt32(72, bytes.length, true)
  view.setInt32(180, count, true)
  view.setInt32(184, table, true)
  for (let i = 0; i < count; i++) {
    const at = table + i * 80,
      offset = start + i * span
    bytes.set(new TextEncoder().encode(`body_${i}`), at)
    view.setInt32(at + 68, size, true)
    view.setInt32(at + 72, size, true)
    view.setInt32(at + 76, offset, true)
    bytes.fill(128, offset, offset + size * size)
    for (let c = 0; c < 256; c++) bytes.set([c, c, c], offset + size * size + c * 3)
  }
  return bytes
}

test('rejects malformed texture bounds and unsafe placement without mutating source', () => {
  const source = fixture(),
    before = source.slice()
  assert.throws(
    () => bakeSticker(source, testSticker(), { texture: 0, u: NaN, v: 0.5, size: 0.2, angle: 0 }),
    /placement/
  )
  assert.throws(
    () => bakeSticker(source, testSticker(), { texture: 99, u: 0.5, v: 0.5, size: 0.2, angle: 0 }),
    /surface/
  )
  assert.deepEqual(source, before)
  const invalid = source.slice()
  new DataView(invalid.buffer).setInt32(244 + 76, invalid.length - 2, true)
  assert.throws(() => modelTextures(invalid), /model/)
  assert.throws(
    () =>
      validateProjection({
        center: [0, 0, 0],
        right: [2, 0, 0],
        up: [0, 1, 0],
        normal: [0, 0, 1],
        size: 0.2,
        angle: 0
      }),
    /placement/
  )
})

test('bake changes only selected texture data and retains a vivid decal in a grayscale model', () => {
  const source = fixture(),
    textures = modelTextures(source),
    before = source.slice()
  const output = bakeSticker(source, testSticker(), {
    texture: 0,
    u: 0.5,
    v: 0.5,
    size: 0.2,
    angle: 0
  })
  assert.deepEqual(source, before)
  assert.deepEqual(output.subarray(0, textures[0].offset), source.subarray(0, textures[0].offset))
  assert.deepEqual(output.subarray(textures[1].offset), source.subarray(textures[1].offset))
  const rgba = texturePixels(output, textures[0]),
    at = (240 * 512 + 240) * 4
  assert.ok(rgba[at] > 200 && rgba[at + 1] < 100)
})

test('one projection crosses material seams but does not paint the reverse-facing surface', () => {
  const source = fixture(),
    atlas = {
      model: source,
      extent: 4,
      faces: [
        {
          texture: 0,
          uv: [
            [10, 10],
            [10, 110],
            [110, 10]
          ],
          points: [
            [-1, -1, 0],
            [-1, 1, 0],
            [0, -1, 0]
          ],
          tile: [8, 8, 106, 106]
        },
        {
          texture: 1,
          uv: [
            [10, 10],
            [10, 110],
            [110, 10]
          ],
          points: [
            [0, -1, 0],
            [0, 1, 0],
            [1, -1, 0]
          ],
          tile: [8, 8, 106, 106]
        },
        {
          texture: 0,
          uv: [
            [150, 10],
            [150, 110],
            [250, 10]
          ],
          points: [
            [-1, -1, -0.2],
            [0, -1, -0.2],
            [-1, 1, -0.2]
          ],
          tile: [148, 8, 106, 106]
        }
      ]
    }
  const sticker = {
    width: 4,
    height: 4,
    rgba: new Uint8Array(Array.from({ length: 16 }, () => [230, 40, 20, 255]).flat())
  }
  // GoldSrc face winding can face away from the camera. Preserve the picked winding.
  const output = bakeProjectedSticker(atlas, sticker, {
    center: [0, 0, 0],
    right: [1, 0, 0],
    up: [0, 1, 0],
    normal: [0, 0, -1],
    size: 0.65,
    angle: 0
  })
  const textures = modelTextures(output)
  for (const texture of textures) {
    const rgba = texturePixels(output, texture),
      at = (45 * 512 + 45) * 4
    assert.ok(
      rgba[at] > 200 && rgba[at + 1] < 100,
      'each side of seam receives the same projection'
    )
  }
  const rgba = texturePixels(output, textures[0]),
    back = (45 * 512 + 185) * 4
  assert.deepEqual([...rgba.subarray(back, back + 4)], [128, 128, 128, 255])
})

test('all supported languages cover every editor label and actionable error', async () => {
  const translations = JSON.parse(
    await readFile(
      new URL(
        '../src/renderer/src/features/sticker-editor/sticker-translations.json',
        import.meta.url
      ),
      'utf8'
    )
  )
  assert.deepEqual(Object.keys(translations), ['en', 'ru', 'tl', 'th', 'id', 'hi', 'pt', 'ja'])
  for (const values of Object.values(translations))
    assert.deepEqual(Object.keys(values), Object.keys(translations.en))
})

test(
  'optional stock AK-47 round trip keeps model format and adds isolated texture pages',
  { skip: !process.env.STICKER_TEST_MODEL },
  async () => {
    const source = new Uint8Array(await readFile(process.env.STICKER_TEST_MODEL)),
      before = source.slice()
    const atlas = prepareStickerAtlas(source)
    assert.deepEqual(source, before)
    assert.ok(atlas.faces.length > 0)
    const grip = modelTextures(source).findIndex((t) => t.name === 'handle.bmp')
    assert.ok(grip >= 0)
    const bakedView = new DataView(atlas.model.buffer)
    // The original grip skin reference must be replaced by paintable atlas pages.
    const bodyCount = bakedView.getInt32(204, true)
    const bodyOffset = bakedView.getInt32(208, true)
    let originalGripMeshes = 0
    for (let b = 0; b < bodyCount; b++) {
      const body = bodyOffset + b * 76
      const part = bakedView.getInt32(body + 72, true)
      const meshes = bakedView.getInt32(part + 72, true)
      const meshOffset = bakedView.getInt32(part + 76, true)
      for (let m = 0; m < meshes; m++)
        if (bakedView.getInt32(meshOffset + m * 20 + 8, true) === grip) originalGripMeshes++
    }
    assert.equal(originalGripMeshes, 0, 'grip mesh is converted to paintable atlas pages')

    assert.doesNotThrow(() => validateStudioTextureLayout(atlas.model))
    const broken = atlas.model.slice()
    const view = new DataView(broken.buffer)
    view.setInt32(188, view.getInt32(188, true) - 1, true)
    assert.throws(() => validateStudioTextureLayout(broken), /model/)
    assert.ok(modelTextures(atlas.model).length > modelTextures(source).length)
    assert.equal(new DataView(atlas.model.buffer).getInt32(72, true), atlas.model.length)
  }
)

test('multiple transparent stickers composite in order before palette conversion', () => {
  const source = fixture(1)
  const atlas = {
    model: source,
    extent: 4,
    faces: [
      {
        texture: 0,
        uv: [
          [10, 10],
          [10, 110],
          [110, 10]
        ],
        points: [
          [-1, -1, 0],
          [-1, 1, 0],
          [1, -1, 0]
        ],
        tile: [8, 8, 106, 106]
      }
    ]
  }
  const projection = {
    center: [0, 0, 0],
    right: [1, 0, 0],
    up: [0, 1, 0],
    normal: [0, 0, -1],
    size: 0.65,
    angle: 0
  }
  const red = { width: 1, height: 1, rgba: new Uint8Array([255, 0, 0, 255]) }
  const blue = { width: 1, height: 1, rgba: new Uint8Array([0, 0, 255, 128]) }
  const fullColor = fullColorStickerTextures(atlas, [
    { sticker: red, projection },
    { sticker: blue, projection }
  ])
  assert.deepEqual(
    [...fullColor[0].rgba.subarray((45 * 512 + 45) * 4, (45 * 512 + 45) * 4 + 4)],
    [127, 0, 128, 255]
  )
  const gradient = new Uint8Array(64 * 64 * 4)
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) gradient.set([x * 4, y * 4, 17, 255], (y * 64 + x) * 4)
  const rich = fullColorStickerTextures(atlas, [
    { sticker: { width: 64, height: 64, rgba: gradient }, projection }
  ])[0].rgba
  const colors = new Set()
  for (let at = 0; at < rich.length; at += 4)
    colors.add(`${rich[at]},${rich[at + 1]},${rich[at + 2]}`)
  assert.ok(colors.size > 256, 'RGBA output is not reduced to a model palette')
  const output = bakeProjectedStickers(atlas, [
    { sticker: red, projection },
    { sticker: blue, projection }
  ])
  const rgba = texturePixels(output, modelTextures(output)[0])
  const pixel = [...rgba.subarray((45 * 512 + 45) * 4, (45 * 512 + 45) * 4 + 4)]
  assert.ok(Math.abs(pixel[0] - 127) < 10 && pixel[1] < 10 && Math.abs(pixel[2] - 128) < 10)
  assert.throws(
    () => bakeProjectedStickers(atlas, Array(6).fill({ sticker: red, projection })),
    /placement/
  )
  assert.throws(
    () => bakeProjectedStickers(atlas, [{ sticker: { ...red, width: 513 }, projection }]),
    /image/
  )
})

test('inventory rejects partial consumption and malformed saved projections', () => {
  const item = {
    id: '11111111-1111-4111-8111-111111111111',
    stickerId: 'test',
    name: 'Test',
    imagePath: `media/16competitive/stickers/${'a'.repeat(64)}/image.png`,
    acquiredAt: '2026-11-04T00:00:00.000Z',
    appliedAt: null,
    weaponKey: null,
    projection: null
  }
  assert.doesNotThrow(() => parseStickerSnapshot({ catalog: [], items: [item] }))
  assert.throws(() =>
    parseStickerSnapshot({ catalog: [], items: [{ ...item, weaponKey: 'stock:ak47' }] })
  )
  assert.throws(() => parseStickerSnapshot({ catalog: [], items: [item, item] }))
  assert.throws(() => parseStickerSnapshot({ catalog: [null], items: [] }))
  assert.throws(() =>
    parseStickerProjection({
      center: [0, 0, 0],
      right: [1, 0, 0],
      up: [1, 0, 0],
      normal: [0, 0, 1],
      size: 0.2,
      angle: 0
    })
  )
})

test(
  'verified recipe bake rejects altered content and validates the final stock model',
  { skip: !process.env.STICKER_TEST_MODEL },
  async () => {
    const artifactModule = path.join(temp, 'bake.mjs')
    await build({
      entryPoints: [new URL('../src/main/game/sticker-bake.ts', import.meta.url).pathname],
      outfile: artifactModule,
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent'
    })
    const { bakeStickerRecipe } = await import(pathToFileURL(artifactModule).href)
    const imageBytes = new Uint8Array([1, 2, 3])
    const imageHash = createHash('sha256').update(imageBytes).digest('hex')
    const source = new Uint8Array(await readFile(process.env.STICKER_TEST_MODEL))
    const content = {
      version: 1,
      sourcePath: 'models/v_ak47.mdl',
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      stickers: [
        {
          imagePath: `media/16competitive/stickers/${imageHash}/image.png`,
          projection: {
            center: [0, 0, 0],
            right: [1, 0, 0],
            up: [0, 1, 0],
            normal: [0, 0, 1],
            size: 0.2,
            angle: 0
          }
        }
      ]
    }
    const recipe = {
      ...content,
      id: createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 32)
    }
    const artifact = await bakeStickerRecipe(
      recipe,
      source,
      async () => imageBytes,
      async () => testSticker()
    )
    assert.equal(artifact.recipeId, recipe.id)
    assert.equal(
      artifact.textureSha256,
      createHash('sha256').update(artifact.textureBytes).digest('hex')
    )
    assert.equal(Buffer.from(artifact.textureBytes.subarray(0, 8)).toString(), '16CRGBA1')
    assert.equal(artifact.sha256, createHash('sha256').update(artifact.bytes).digest('hex'))
    assert.doesNotThrow(() => validateStudioTextureLayout(artifact.bytes))
    await assert.rejects(
      bakeStickerRecipe(
        { ...recipe, id: '0'.repeat(32) },
        source,
        async () => imageBytes,
        async () => testSticker()
      ),
      /RECIPE_INVALID/
    )
    await assert.rejects(
      bakeStickerRecipe(
        recipe,
        new Uint8Array([0]),
        async () => imageBytes,
        async () => testSticker()
      ),
      /MODEL_UNSUPPORTED/
    )
    await assert.rejects(
      bakeStickerRecipe(
        recipe,
        source,
        async () => new Uint8Array([4]),
        async () => testSticker()
      ),
      /IMAGE_INVALID/
    )
  }
)

test('hand texture filtering keeps the weapon grip visible and paintable', () => {
  for (const name of [
    'view_glove.bmp',
    'view_skin.BMP',
    'view_finger.bmp',
    'hand.bmp',
    'v_hands.bmp',
    'gloves.bmp',
    'fingers.bmp',
    'sleeves.bmp',
    'sleeve_01.bmp'
  ])
    assert.equal(isHandTexture(name), true, name)
  for (const name of ['handle.bmp', 'forearm.bmp', 'handguard.bmp', 'lower_body.bmp'])
    assert.equal(isHandTexture(name), false, name)
})

test(
  'all pinned stock weapons produce valid isolated sticker atlases',
  { skip: !process.env.STICKER_TEST_MODEL },
  async () => {
    const { STOCK_STICKER_MODELS } = await import('../src/shared/stock-sticker-models.ts')
    const recipePath = path.join(temp, 'recipes.mjs')
    await build({
      entryPoints: [new URL('../src/shared/sticker-recipes.ts', import.meta.url).pathname],
      outfile: recipePath,
      bundle: true,
      platform: 'node',
      format: 'esm'
    })
    const { parseStickerRecipes } = await import(pathToFileURL(recipePath).href)
    for (const [key, entry] of Object.entries(STOCK_STICKER_MODELS)) {
      const recipe = {
        version: 1,
        id: 'a'.repeat(32),
        sourcePath: `models/v_${entry.model}.mdl`,
        sourceSha256: entry.sha256,
        stickers: [
          {
            imagePath: `media/16competitive/stickers/${'b'.repeat(64)}/image.png`,
            projection: {
              center: [0, 0, 0],
              right: [1, 0, 0],
              up: [0, 1, 0],
              normal: [0, 0, 1],
              size: 0.2,
              angle: 0
            }
          }
        ]
      }
      assert.doesNotThrow(() => parseStickerRecipes({ recipes: [recipe] }), key)
      assert.throws(
        () => parseStickerRecipes({ recipes: [{ ...recipe, sourceSha256: '0'.repeat(64) }] }),
        key
      )

      const source = new Uint8Array(
        await readFile(
          path.join(path.dirname(process.env.STICKER_TEST_MODEL), `v_${entry.model}.mdl`)
        )
      )
      assert.equal(createHash('sha256').update(source).digest('hex'), entry.sha256, key)
      const before = source.slice()
      const atlas = prepareStickerAtlas(source)
      assert.ok(atlas.faces.length > 0, key)
      validateStudioNormalLayout(atlas.model)
      validateStudioTextureLayout(atlas.model)
      if (process.env.STICKER_TEST_OUTPUT_DIR) {
        await mkdir(process.env.STICKER_TEST_OUTPUT_DIR, { recursive: true })
        await writeFile(path.join(process.env.STICKER_TEST_OUTPUT_DIR, `${key}.mdl`), atlas.model)
      }
      assert.deepEqual(source, before, key)
    }
  }
)

test(
  'custom catalog skins bake projected stickers with verified source hashes',
  {
    skip: !process.env.CUSTOM_STICKER_CATALOG || !process.env.CUSTOM_STICKER_MODEL_ROOT
  },
  async () => {
    const bakePath = path.join(temp, 'custom-bake.mjs')
    await build({
      entryPoints: [new URL('../src/main/game/sticker-bake.ts', import.meta.url).pathname],
      outfile: bakePath,
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent'
    })
    const { bakeStickerRecipe } = await import(pathToFileURL(bakePath).href)
    const catalog = JSON.parse(await readFile(process.env.CUSTOM_STICKER_CATALOG, 'utf8'))
    const image = new Uint8Array([1, 2, 3])
    const imageHash = createHash('sha256').update(image).digest('hex')
    for (const skin of catalog) {
      const source = new Uint8Array(
        await readFile(path.join(process.env.CUSTOM_STICKER_MODEL_ROOT, skin.view_model_path))
      )
      const atlas = prepareStickerAtlas(source, true)
      assert.ok(atlas.faces.length, skin.name)
      const [a, b, c] = atlas.faces[0].points
      const sub = (a, b) => a.map((n, i) => n - b[i])
      const unit = (a) => a.map((n) => n / Math.hypot(...a))
      const cross = (a, b) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
      ]
      const right = unit(sub(b, a)),
        normal = unit(cross(sub(b, a), sub(c, a)))
      const projection = {
        center: a.map((n, i) => (n + b[i] + c[i]) / 3),
        right,
        up: unit(cross(normal, right)),
        normal,
        size: 0.2,
        angle: 0
      }
      const content = {
        version: 1,
        sourcePath: skin.view_model_path,
        sourceSha256: createHash('sha256').update(source).digest('hex'),
        stickers: [{ imagePath: `media/16competitive/stickers/${imageHash}/image.png`, projection }]
      }
      const recipe = {
        ...content,
        id: createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 32)
      }
      const result = await bakeStickerRecipe(
        recipe,
        source,
        async () => image,
        async () => testSticker()
      )
      validateStudioNormalLayout(result.bytes)
      validateStudioTextureLayout(result.bytes)
      assert.notDeepEqual(result.bytes, atlas.model, skin.name)
      const altered = source.slice()
      altered[100] ^= 1
      await assert.rejects(
        bakeStickerRecipe(
          recipe,
          altered,
          async () => image,
          async () => testSticker()
        ),
        /MODEL_UNSUPPORTED/
      )
    }
  }
)
