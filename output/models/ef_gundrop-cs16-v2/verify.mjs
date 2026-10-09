import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readMdlTextures, textureToBmp } from '../../../scripts/extract-mdl-textures.mjs'
import { readIndexedBmp } from '../../../scripts/import-mdl-textures.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const original = await readFile(path.join(root, 'original.mdl'))
const rebuilt = await readFile(path.join(root, 'ef_gundrop.mdl'))
const originalTextures = readMdlTextures(original)
const rebuiltTextures = readMdlTextures(rebuilt)
assert.equal(rebuilt.length, original.length)
assert.deepEqual(rebuiltTextures, originalTextures)
const excluded = new Uint8Array(original.length)
const textureResults = []
for (const t of rebuiltTextures) {
  const stem = `${String(t.index).padStart(3, '0')}_${t.name}`
  const bmp = await readFile(path.join(root, 'textures', stem))
  const parsed = readIndexedBmp(bmp, stem)
  assert.equal(parsed.width, t.width)
  assert.equal(parsed.height, t.height)
  assert.deepEqual(textureToBmp(rebuilt, t), bmp)
  const beforeBmp = await readFile(path.join(root, 'original-textures', stem))
  assert.deepEqual(textureToBmp(original, originalTextures[t.index]), beforeBmp)
  excluded.fill(1, t.dataOffset, t.paletteOffset + 768)
  textureResults.push({name:t.name,width:t.width,height:t.height,bitsPerPixel:bmp.readUInt16LE(28),compression:bmp.readUInt32LE(30),paletteEntries:bmp.readUInt32LE(46),flags:t.flags,roundTripExact:true})
}
let changes = 0
for (let i = 0; i < original.length; i++) {
  if (!excluded[i]) assert.equal(rebuilt[i],original[i],`Non-texture byte changed at ${i}`)
  else if (rebuilt[i] !== original[i]) changes++
}
assert(changes > 0)
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')
const result = {format:'IDST version 10',bytes:rebuilt.length,nonTextureBytesUnchanged:true,changedTextureBytes:changes,textures:textureResults,originalSha256:sha256(original),rebuiltSha256:sha256(rebuilt)}
await writeFile(path.join(root,'verification.json'),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
