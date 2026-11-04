import { app, nativeImage } from 'electron'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, copyFile, symlink, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import assert from 'node:assert/strict'
import { stageMatchStickers } from '../src/main/game/sticker-delivery'
void (async () => {
  await app.whenReady()
  app.setAppPath(process.cwd())
  const root = await mkdtemp(join(tmpdir(), '16c-sticker-delivery-'))
  const gameRoot = join(root, 'game'),
    session = join(root, 'session')
  await mkdir(join(gameRoot, 'cstrike/models'), { recursive: true })
  await mkdir(session)
  const source = process.env.STICKER_TEST_MODEL
  if (!source) throw new Error('Set STICKER_TEST_MODEL')
  const modelName = basename(source)
  await copyFile(source, join(gameRoot, 'cstrike/models', modelName))
  app.setPath('userData', join(root, 'user-data'))
  const shared = join(app.getPath('userData'), 'game-assets/models/16competitive')
  await mkdir(shared, { recursive: true })
  await symlink(shared, join(gameRoot, 'cstrike/models/16competitive'), 'dir')
  const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
  const png = nativeImage
    .createFromBitmap(Buffer.from([0, 0, 255, 255]), { width: 1, height: 1 })
    .toPNG()
  const imagePath = `media/16competitive/stickers/${hash(png)}/image.png`
  const content = {
    version: 1,
    sourcePath: `models/${modelName}`,
    sourceSha256: hash(await readFile(source)),
    stickers: [
      {
        imagePath,
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
  const recipe = { ...content, id: hash(JSON.stringify(content)).slice(0, 32) }
  const server = createServer((request, response) => {
    if (request.url === `/fastdl/${imagePath}`) {
      response.end(png)
      return
    }
    if (request.headers.authorization !== 'Bearer fixture') {
      response.writeHead(401).end()
      return
    }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ recipes: [recipe] }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Invalid test address')
    const options = {
      matchId: '11111111-1111-4111-8111-111111111111',
      apiUrl: `http://127.0.0.1:${address.port}`,
      token: 'fixture',
      gameRoot,
      session
    }
    await stageMatchStickers(options)
    const manifest = await readFile(join(session, 'stickers.tsv'), 'utf8')
    const rows = manifest.trim().split('\n')
    assert.equal(rows.length, 3)
    const [id, sha, model] = rows[2].split('\t')
    assert.equal(id, recipe.id)
    assert.equal(model, content.sourcePath)
    const baked = await readFile(
      join(gameRoot, `cstrike/models/16competitive/st/${sha.slice(0, 32)}.mdl`)
    )
    assert.equal(hash(baked), sha)
    await stageMatchStickers(options)
    assert.equal(await readFile(join(session, 'stickers.tsv'), 'utf8'), manifest)
    assert.equal(
      hash(await readFile(join(gameRoot, 'cstrike/models', modelName))),
      content.sourceSha256
    )
    console.log(
      'Sticker delivery smoke passed: authenticated recipe, PNG decode, worker bake, immutable cache and repeat staging.'
    )
  } finally {
    server.close()
    await rm(root, { recursive: true, force: true })
  }
  app.exit(0)
})().catch((error) => {
  console.error(error)
  app.exit(1)
})
