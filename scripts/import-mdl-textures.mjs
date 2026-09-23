/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { readMdlTextures } from './extract-mdl-textures.mjs'

const BMP_PIXEL_OFFSET = 10
const BMP_WIDTH_OFFSET = 18
const BMP_HEIGHT_OFFSET = 22
const BMP_BITS_PER_PIXEL_OFFSET = 28
const BMP_COMPRESSION_OFFSET = 30
const BMP_COLOR_TABLE_OFFSET = 54
const PALETTE_SIZE = 256 * 3

function fail(message) {
  throw new Error(`MDL texture import: ${message}`)
}

/** Reads an uncompressed, 8-bit paletted BMP and returns pixels in MDL top-down order. */
export function readIndexedBmp(bmp, sourceName = 'BMP') {
  if (bmp.length < BMP_COLOR_TABLE_OFFSET || bmp.toString('ascii', 0, 2) !== 'BM') fail(`${sourceName} is not a BMP file`)
  const pixelOffset = bmp.readUInt32LE(BMP_PIXEL_OFFSET)
  const width = bmp.readInt32LE(BMP_WIDTH_OFFSET)
  const signedHeight = bmp.readInt32LE(BMP_HEIGHT_OFFSET)
  const bitCount = bmp.readUInt16LE(BMP_BITS_PER_PIXEL_OFFSET)
  const compression = bmp.readUInt32LE(BMP_COMPRESSION_OFFSET)
  const height = Math.abs(signedHeight)
  const rowStride = (width + 3) & ~3
  if (width <= 0 || height <= 0 || bitCount !== 8 || compression !== 0 || pixelOffset < BMP_COLOR_TABLE_OFFSET || pixelOffset + rowStride * height > bmp.length) {
    fail(`${sourceName} must be an uncompressed 8-bit paletted BMP`)
  }

  const pixels = Buffer.alloc(width * height)
  for (let y = 0; y < height; y++) {
    const sourceRow = signedHeight > 0 ? height - 1 - y : y
    bmp.copy(pixels, y * width, pixelOffset + sourceRow * rowStride, pixelOffset + sourceRow * rowStride + width)
  }
  const palette = Buffer.alloc(PALETTE_SIZE)
  for (let color = 0; color < 256; color++) {
    const source = BMP_COLOR_TABLE_OFFSET + color * 4
    const target = color * 3
    palette[target] = bmp[source + 2]
    palette[target + 1] = bmp[source + 1]
    palette[target + 2] = bmp[source]
  }
  return { width, height, pixels, palette }
}

async function readManifest(texturesDirectory) {
  try {
    const manifest = JSON.parse(await readFile(path.join(texturesDirectory, 'textures.json'), 'utf8'))
    if (manifest.format !== 'goldsrc-mdl-textures-v1' || !Array.isArray(manifest.textures)) fail('textures.json is not an extraction manifest')
    const entries = manifest.textures.map((texture) => {
      if (!Number.isInteger(texture?.index) || typeof texture.file !== 'string' || !Number.isInteger(texture.flags)) fail('textures.json contains an invalid texture entry')
      return [texture.index, { file: texture.file, flags: texture.flags }]
    })
    return new Map(entries)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

/**
 * Replaces embedded texture pixels/palettes in a copy of an MDL.
 * BMP dimensions must exactly match the target MDL; geometry and texture metadata are never changed.
 * @param {{ modelPath: string, texturesDirectory: string, outputPath: string }} options
 */
export async function importMdlTextures({ modelPath, texturesDirectory, outputPath }) {
  const mdl = await readFile(modelPath)
  const textures = readMdlTextures(mdl)
  const manifest = await readManifest(texturesDirectory)

  for (const texture of textures) {
    const manifestTexture = manifest?.get(texture.index)
    const fileName = manifestTexture?.file ?? `${texture.name}.bmp`
    if (typeof fileName !== 'string' || !fileName || path.basename(fileName) !== fileName) fail(`invalid filename for texture ${texture.index}`)
    const bmp = readIndexedBmp(await readFile(path.join(texturesDirectory, fileName)), fileName)
    if (bmp.width !== texture.width || bmp.height !== texture.height) {
      fail(`${fileName} is ${bmp.width}x${bmp.height}; ${texture.name} must remain ${texture.width}x${texture.height}`)
    }
    bmp.pixels.copy(mdl, texture.dataOffset)
    bmp.palette.copy(mdl, texture.paletteOffset)
    if (manifestTexture) mdl.writeInt32LE(manifestTexture.flags, texture.recordOffset + 64)
  }

  const temporaryPath = `${outputPath}.tmp-${process.pid}`
  await writeFile(temporaryPath, mdl)
  await rename(temporaryPath, outputPath)
  return { textureCount: textures.length, outputPath }
}

async function main() {
  const [modelPath, texturesDirectory, outputPath] = process.argv.slice(2)
  if (!modelPath || !texturesDirectory || !outputPath) {
    console.error('Usage: node scripts/import-mdl-textures.mjs <base-model.mdl> <texture-folder> <output-model.mdl>')
    process.exitCode = 1
    return
  }
  const result = await importMdlTextures({ modelPath, texturesDirectory, outputPath })
  console.log(`Imported ${result.textureCount} texture(s) into ${result.outputPath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
