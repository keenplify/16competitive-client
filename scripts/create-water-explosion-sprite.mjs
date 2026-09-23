import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { decodeRgbPng } from './create-water-ak47-skin.mjs'

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)))

function readReferenceSprite(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'IDSP' || buffer.readInt32LE(4) !== 2) {
    throw new Error('Expected a GoldSrc IDSP version 2 sprite')
  }
  const width = buffer.readInt32LE(20)
  const height = buffer.readInt32LE(24)
  const frameCount = buffer.readInt32LE(28)
  const paletteSize = buffer.readUInt16LE(40)
  if (width <= 0 || height <= 0 || width > 256 || height > 256 || frameCount < 2 || frameCount > 64 || paletteSize !== 256) {
    throw new Error('Unsupported fexplo.spr dimensions, frame count, or palette')
  }
  const frameHeaders = []
  let offset = 42 + paletteSize * 3
  for (let i = 0; i < frameCount; i++) {
    if (offset + 20 > buffer.length || buffer.readInt32LE(offset) !== 0 ||
      buffer.readInt32LE(offset + 12) !== width || buffer.readInt32LE(offset + 16) !== height) {
      throw new Error(`Unsupported source sprite frame ${i}`)
    }
    frameHeaders.push(Buffer.from(buffer.subarray(offset, offset + 20)))
    offset += 20 + width * height
  }
  if (offset !== buffer.length) throw new Error('Unexpected trailing sprite data')
  return { width, height, frameCount, frameHeaders }
}

function sampleSheet(sheet, frame, x, y, width, height) {
  const column = frame % 4
  const row = Math.floor(frame / 4)
  const side = Math.min(width, height)
  const left = Math.floor((width - side) / 2)
  const top = Math.floor((height - side) / 2)
  if (x < left || x >= left + side || y < top || y >= top + side) return [0, 0, 0]
  // Inset each cell slightly so generated grid-line artifacts cannot appear in-game.
  const u = 0.02 + 0.96 * ((x - left + 0.5) / side)
  const v = 0.02 + 0.96 * ((y - top + 0.5) / side)
  const sx = Math.min(sheet.width - 1, Math.floor((column + u) * sheet.width / 4))
  const sy = Math.min(sheet.height - 1, Math.floor((row + v) * sheet.height / 4))
  const offset = (sy * sheet.width + sx) * sheet.channels
  const alpha = sheet.channels === 4 ? sheet.pixels[offset + 3] / 255 : 1
  return [
    clamp(sheet.pixels[offset] * alpha),
    clamp(sheet.pixels[offset + 1] * alpha),
    clamp(sheet.pixels[offset + 2] * alpha)
  ]
}

function renderFrames(sheet, layout) {
  if (sheet.width < 512 || sheet.height < 512) throw new Error('Splash sheet must contain a 4x4 grid of sufficiently large frames')
  const frames = []
  for (let frame = 0; frame < layout.frameCount; frame++) {
    const rgb = Buffer.alloc(layout.width * layout.height * 3)
    for (let y = 0; y < layout.height; y++) for (let x = 0; x < layout.width; x++) {
      const sourceFrame = Math.round(frame * 15 / (layout.frameCount - 1))
      const color = sampleSheet(sheet, sourceFrame, x, y, layout.width, layout.height)
      const fade = frame === layout.frameCount - 1 ? 0.35 : 1
      const target = (y * layout.width + x) * 3
      rgb[target] = clamp(color[0] * fade)
      rgb[target + 1] = clamp(color[1] * fade)
      rgb[target + 2] = clamp(color[2] * fade)
    }
    frames.push(rgb)
  }
  return frames
}

function quantizeFrames(frames, width, height) {
  const bins = new Map()
  for (const frame of frames) for (let offset = 0; offset < frame.length; offset += 3) {
    const r = frame[offset], g = frame[offset + 1], b = frame[offset + 2]
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)
    const bin = bins.get(key) ?? [0, 0, 0, 0]
    bin[0]++; bin[1] += r; bin[2] += g; bin[3] += b
    bins.set(key, bin)
  }
  const palette = [[0, 0, 0], [255, 255, 255], [124, 220, 255], [24, 150, 225]]
  for (const [, bin] of [...bins.entries()].sort((a, b) => b[1][0] - a[1][0])) {
    if (palette.length === 256) break
    palette.push([bin[1] / bin[0], bin[2] / bin[0], bin[3] / bin[0]])
  }
  while (palette.length < 256) palette.push([0, 0, 0])

  const paletteBytes = Buffer.alloc(256 * 3)
  for (let i = 0; i < 256; i++) {
    paletteBytes[i * 3] = clamp(palette[i][0])
    paletteBytes[i * 3 + 1] = clamp(palette[i][1])
    paletteBytes[i * 3 + 2] = clamp(palette[i][2])
  }
  const cache = new Map()
  const indexedFrames = frames.map((frame) => {
    const indexed = Buffer.alloc(width * height)
    for (let pixel = 0; pixel < indexed.length; pixel++) {
      const offset = pixel * 3
      const r = frame[offset], g = frame[offset + 1], b = frame[offset + 2]
      if (r + g + b < 9) { indexed[pixel] = 0; continue }
      const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)
      let choice = cache.get(key)
      if (choice === undefined) {
        let best = Infinity
        for (let i = 1; i < 256; i++) {
          const dr = r - palette[i][0], dg = g - palette[i][1], db = b - palette[i][2]
          const distance = dr * dr + dg * dg + db * db
          if (distance < best) { best = distance; choice = i }
        }
        cache.set(key, choice)
      }
      indexed[pixel] = choice
    }
    return indexed
  })
  return { paletteBytes, indexedFrames }
}

async function writeFramePreview(outputPath, palette, frames, frameWidth, frameHeight) {
  const width = frameWidth * 4
  const height = frameHeight * Math.ceil(frames.length / 4)
  const stride = (width + 3) & ~3
  const pixelOffset = 1078
  const bmp = Buffer.alloc(pixelOffset + stride * height)
  bmp.write('BM', 0, 'ascii')
  bmp.writeUInt32LE(bmp.length, 2)
  bmp.writeUInt32LE(pixelOffset, 10)
  bmp.writeUInt32LE(40, 14)
  bmp.writeInt32LE(width, 18)
  bmp.writeInt32LE(height, 22)
  bmp.writeUInt16LE(1, 26)
  bmp.writeUInt16LE(8, 28)
  bmp.writeUInt32LE(stride * height, 34)
  bmp.writeUInt32LE(256, 46)
  for (let i = 0; i < 256; i++) {
    bmp[54 + i * 4] = palette[i * 3 + 2]
    bmp[55 + i * 4] = palette[i * 3 + 1]
    bmp[56 + i * 4] = palette[i * 3]
  }
  for (let frame = 0; frame < frames.length; frame++) {
    const column = frame % 4
    const row = Math.floor(frame / 4)
    for (let y = 0; y < frameHeight; y++) {
      const target = pixelOffset + (height - 1 - (row * frameHeight + y)) * stride + column * frameWidth
      frames[frame].copy(bmp, target, y * frameWidth, (y + 1) * frameWidth)
    }
  }
  const previewPath = outputPath.replace(/\.spr$/i, '') + '_preview.bmp'
  await writeFile(previewPath, bmp)
  return previewPath
}

/** Create a water splash SPR matching the reference sprite's frame layout. */
export async function createWaterExplosionSprite(referencePath, sheetPath, outputPath) {
  const reference = await readFile(referencePath)
  const layout = readReferenceSprite(reference)
  const sheet = decodeRgbPng(await readFile(sheetPath))
  const { paletteBytes, indexedFrames } = quantizeFrames(renderFrames(sheet, layout), layout.width, layout.height)
  const header = Buffer.from(reference.subarray(0, 42))
  header.writeInt32LE(1, 12) // GoldSrc SPR_ADDITIVE, matching fexplo.spr
  const output = Buffer.concat([
    header,
    paletteBytes,
    ...layout.frameHeaders.flatMap((frameHeader, index) => [frameHeader, indexedFrames[index]])
  ])
  await writeFile(outputPath, output)
  const previewPath = await writeFramePreview(outputPath, paletteBytes, indexedFrames, layout.width, layout.height)
  return { outputPath, previewPath, frameCount: indexedFrames.length, width: layout.width, height: layout.height }
}

async function main() {
  const [reference, sheet, output] = process.argv.slice(2)
  if (!reference || !sheet || !output) {
    console.error('Usage: node scripts/create-water-explosion-sprite.mjs <fexplo.spr> <splash-sheet.png> <output.spr>')
    process.exitCode = 1
    return
  }
  const result = await createWaterExplosionSprite(reference, sheet, output)
  console.log(`Created ${result.frameCount}-frame ${result.width}x${result.height} water splash sprite: ${result.outputPath}`)
  console.log(`Frame preview: ${result.previewPath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
