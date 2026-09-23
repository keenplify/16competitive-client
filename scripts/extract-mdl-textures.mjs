import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const MDL_ID = Buffer.from('IDST').readInt32LE(0)
const MDL_VERSION = 10
const HEADER_TEXTURE_COUNT_OFFSET = 180
const HEADER_TEXTURE_OFFSET_OFFSET = 184
const TEXTURE_RECORD_SIZE = 80
const PALETTE_SIZE = 256 * 3

function fail(message) {
  throw new Error(`MDL texture extraction: ${message}`)
}

function readCString(buffer, offset, length) {
  const end = buffer.indexOf(0, offset)
  return buffer.subarray(offset, end === -1 ? offset + length : Math.min(end, offset + length)).toString('latin1')
}

/**
 * Reads the embedded GoldSrc v10 texture table without interpreting model geometry.
 * @param {Buffer} mdl
 */
export function readMdlTextures(mdl) {
  if (mdl.length < HEADER_TEXTURE_OFFSET_OFFSET + 4) fail('file is too small to be a GoldSrc MDL')
  if (mdl.readInt32LE(0) !== MDL_ID || mdl.readInt32LE(4) !== MDL_VERSION) {
    fail('expected an IDST version 10 GoldSrc MDL')
  }

  const count = mdl.readInt32LE(HEADER_TEXTURE_COUNT_OFFSET)
  const tableOffset = mdl.readInt32LE(HEADER_TEXTURE_OFFSET_OFFSET)
  if (count < 0 || count > 4096 || tableOffset < 0 || tableOffset + count * TEXTURE_RECORD_SIZE > mdl.length) {
    fail('texture table is outside the MDL file')
  }

  return Array.from({ length: count }, (_, index) => {
    const recordOffset = tableOffset + index * TEXTURE_RECORD_SIZE
    const name = readCString(mdl, recordOffset, 64) || `texture_${index}`
    const flags = mdl.readInt32LE(recordOffset + 64)
    const width = mdl.readInt32LE(recordOffset + 68)
    const height = mdl.readInt32LE(recordOffset + 72)
    const dataOffset = mdl.readInt32LE(recordOffset + 76)
    const pixelsLength = width * height
    const paletteOffset = dataOffset + pixelsLength
    if (!Number.isSafeInteger(pixelsLength) || width <= 0 || height <= 0 || dataOffset < 0 || paletteOffset + PALETTE_SIZE > mdl.length) {
      fail(`texture ${index} (${name}) has an invalid pixel or palette range`)
    }

    return { index, name, flags, width, height, dataOffset, paletteOffset, recordOffset }
  })
}

function safeFileStem(value) {
  return value
    .replace(/\.bmp$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '') || 'texture'
}

/** Creates a Windows BMP using the MDL's indexed pixels and RGB palette. */
export function textureToBmp(mdl, texture) {
  const rowStride = (texture.width + 3) & ~3
  const pixelOffset = 14 + 40 + 256 * 4
  const bmp = Buffer.alloc(pixelOffset + rowStride * texture.height)
  bmp.write('BM', 0, 'ascii')
  bmp.writeUInt32LE(bmp.length, 2)
  bmp.writeUInt32LE(pixelOffset, 10)
  bmp.writeUInt32LE(40, 14)
  bmp.writeInt32LE(texture.width, 18)
  bmp.writeInt32LE(texture.height, 22) // positive height: BMP rows are bottom-up
  bmp.writeUInt16LE(1, 26)
  bmp.writeUInt16LE(8, 28)
  bmp.writeUInt32LE(rowStride * texture.height, 34)
  bmp.writeUInt32LE(256, 46)
  bmp.writeUInt32LE(256, 50)

  for (let color = 0; color < 256; color++) {
    const source = texture.paletteOffset + color * 3
    const target = 54 + color * 4
    bmp[target] = mdl[source + 2] // BMP palette is BGR0; MDL is RGB
    bmp[target + 1] = mdl[source + 1]
    bmp[target + 2] = mdl[source]
  }
  for (let y = 0; y < texture.height; y++) {
    const source = texture.dataOffset + y * texture.width
    const target = pixelOffset + (texture.height - 1 - y) * rowStride
    mdl.copy(bmp, target, source, source + texture.width)
  }
  return bmp
}

/**
 * Extracts every embedded texture to 8-bit BMP files and writes textures.json for lossless re-import.
 * @param {string} mdlPath
 * @param {string} outputDirectory
 */
export async function extractMdlTextures(mdlPath, outputDirectory) {
  const mdl = await readFile(mdlPath)
  const textures = readMdlTextures(mdl)
  await mkdir(outputDirectory, { recursive: true })
  const usedNames = new Set()
  const manifestTextures = []

  for (const texture of textures) {
    const baseName = `${String(texture.index).padStart(3, '0')}_${safeFileStem(texture.name)}`
    let fileName = `${baseName}.bmp`
    let suffix = 2
    while (usedNames.has(fileName.toLowerCase())) fileName = `${baseName}_${suffix++}.bmp`
    usedNames.add(fileName.toLowerCase())
    await writeFile(path.join(outputDirectory, fileName), textureToBmp(mdl, texture))
    manifestTextures.push({ index: texture.index, name: texture.name, file: fileName, width: texture.width, height: texture.height, flags: texture.flags })
  }

  const manifestPath = path.join(outputDirectory, 'textures.json')
  await writeFile(manifestPath, `${JSON.stringify({ format: 'goldsrc-mdl-textures-v1', sourceModel: path.basename(mdlPath), textures: manifestTextures }, null, 2)}\n`)
  return { textureCount: textures.length, outputDirectory, manifestPath, textures: manifestTextures }
}

async function main() {
  const [mdlPath, outputDirectory] = process.argv.slice(2)
  if (!mdlPath || !outputDirectory) {
    console.error('Usage: node scripts/extract-mdl-textures.mjs <model.mdl> <output-folder>')
    process.exitCode = 1
    return
  }
  const result = await extractMdlTextures(mdlPath, outputDirectory)
  console.log(`Extracted ${result.textureCount} texture(s) to ${result.outputDirectory}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
