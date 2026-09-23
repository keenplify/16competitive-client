/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inflateSync } from 'node:zlib'
import { readIndexedBmp } from './import-mdl-textures.mjs'

const PATTERN_PATH = fileURLToPath(new URL('../resources/skin-patterns/water-caustics.png', import.meta.url))
const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)))

/** Decode an 8-bit RGB or RGBA PNG using stock Node.js. */
export function decodeRgbPng(png) {
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid pattern PNG')
  const idat = []
  let width = 0
  let height = 0
  let channels = 0
  for (let offset = 8; offset + 12 <= png.length;) {
    const size = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const start = offset + 8
    if (start + size + 4 > png.length) throw new Error('Truncated pattern PNG')
    if (type === 'IHDR') {
      width = png.readUInt32BE(start)
      height = png.readUInt32BE(start + 4)
      channels = png[start + 9] === 2 ? 3 : png[start + 9] === 6 ? 4 : 0
      if (png[start + 8] !== 8 || !channels) throw new Error('Pattern must be 8-bit RGB or RGBA PNG')
    }
    if (type === 'IDAT') idat.push(png.subarray(start, start + size))
    offset = start + size + 4
    if (type === 'IEND') break
  }
  if (!width || !height || width * height > 16_000_000 || !idat.length) throw new Error('Invalid pattern PNG dimensions')
  const compressed = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  if (compressed.length !== height * (stride + 1)) throw new Error('Invalid pattern PNG pixel data')
  const pixels = Buffer.alloc(width * height * channels)
  for (let y = 0; y < height; y++) {
    const filter = compressed[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0
      const up = y ? pixels[(y - 1) * stride + x] : 0
      const corner = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0
      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 3) predictor = (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - corner
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner)
        predictor = a <= b && a <= c ? left : b <= c ? up : corner
      } else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`)
      pixels[y * stride + x] = (compressed[y * (stride + 1) + 1 + x] + predictor) & 255
    }
  }
  return { width, height, channels, pixels }
}

function waterColors(original, texture, pattern) {
  const { width, height, pixels, palette } = readIndexedBmp(original, texture.file)
  if (width !== texture.width || height !== texture.height) throw new Error(`${texture.file} dimensions changed`)
  const rgb = Buffer.alloc(width * height * 3)
  const lighting = new Float32Array(width * height)
  for (let i = 0; i < pixels.length; i++) {
    const old = pixels[i] * 3
    lighting[i] = palette[old] * 0.2126 + palette[old + 1] * 0.7152 + palette[old + 2] * 0.0722
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = y * width + x
    const light = lighting[pixel]
    // This bright silver bolt is its own recognizable piece in the original
    // receiver atlas. Keep its neutral metal colors, including its shading.
    if (texture.name.toLowerCase() === 'lower_body.bmp' && x >= 124 && x <= 230 && y >= 29 && y <= 70 && light > 75) {
      const old = pixels[pixel] * 3
      for (let channel = 0; channel < 3; channel++) rgb[pixel * 3 + channel] = palette[old + channel]
      continue
    }
    const neighboring = (
      lighting[y * width + Math.max(0, x - 1)] +
      lighting[y * width + Math.min(width - 1, x + 1)] +
      lighting[Math.max(0, y - 1) * width + x] +
      lighting[Math.min(height - 1, y + 1) * width + x]
    ) / 4
    // The original UV atlas supplies the panel lighting, grooves, screws and
    // recessed spaces. Water is printed across its surfaces; it does not
    // replace the model's baked shape and material boundaries.
    const relief = light < 12 ? 0.09 : 0.48 + 0.82 * Math.pow(light / 255, 0.7)
    const edge = (light - neighboring) * 0.75
    const px = (Math.floor(x * 2.6 + texture.index * 107) % pattern.width)
    const py = (Math.floor(y * 2.6 + texture.index * 73) % pattern.height)
    const source = (py * pattern.width + px) * pattern.channels
    const oldBlue = [light * 0.28, light * 0.52, light * 0.74]
    for (let channel = 0; channel < 3; channel++) {
      const blended =
        pattern.pixels[source + channel] * relief * 0.58 +
        oldBlue[channel] * 0.42 + edge
      const darkWater = clamp(blended * 1.4 + [4, 11, 13][channel])
      // A sky-blue finish is easier to read on the small p/w models and keeps
      // the wave contrast from the original generated water pattern.
      rgb[pixel * 3 + channel] = light < 10
        ? clamp(blended)
        : clamp(darkWater * [1.25, 1.1, 1][channel] + [52, 74, 95][channel])
    }
  }
  return rgb
}

function indexedBmp(rgb, width, height) {
  // Each piece gets its own 256-color palette. Frequent colors are retained,
  // and rare colors are mapped to the closest retained color.
  const bins = new Map()
  for (let i = 0; i < rgb.length; i += 3) {
    const key = (rgb[i] >> 3) << 10 | (rgb[i + 1] >> 3) << 5 | (rgb[i + 2] >> 3)
    const bin = bins.get(key) ?? [0, 0, 0, 0]
    bin[0]++; bin[1] += rgb[i]; bin[2] += rgb[i + 1]; bin[3] += rgb[i + 2]
    bins.set(key, bin)
  }
  const palette = [...bins.values()].sort((a, b) => b[0] - a[0]).slice(0, 256)
    .map(([n, r, g, b]) => [r / n, g / n, b / n])
  while (palette.length < 256) palette.push([0, 0, 0])
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
    bmp[54 + i * 4] = clamp(palette[i][2])
    bmp[55 + i * 4] = clamp(palette[i][1])
    bmp[56 + i * 4] = clamp(palette[i][0])
  }
  const cache = new Map()
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = (y * width + x) * 3
    const r = rgb[source], g = rgb[source + 1], b = rgb[source + 2]
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)
    let choice = cache.get(key)
    if (choice === undefined) {
      let distance = Infinity
      for (let i = 0; i < palette.length; i++) {
        const dr = r - palette[i][0], dg = g - palette[i][1], db = b - palette[i][2]
        const next = dr * dr + dg * dg + db * db
        if (next < distance) { distance = next; choice = i }
      }
      cache.set(key, choice)
    }
    bmp[pixelOffset + (height - 1 - y) * stride + x] = choice
  }
  return bmp
}

/** Create an opaque water-pattern skin, retaining the original hands and reticle. */
export async function createWaterModelSkin(sourceDirectory, outputDirectory, patternPath = PATTERN_PATH) {
  const manifest = JSON.parse(await readFile(path.join(sourceDirectory, 'textures.json'), 'utf8'))
  if (manifest.format !== 'goldsrc-mdl-textures-v1' || !Array.isArray(manifest.textures)) throw new Error('Invalid extraction manifest')
  const pattern = decodeRgbPng(await readFile(patternPath))
  await mkdir(outputDirectory, { recursive: true })
  const outputManifest = { ...manifest, textures: manifest.textures.map((t) => ({ ...t, flags: t.flags & ~0x20 })) }
  await writeFile(path.join(outputDirectory, 'textures.json'), `${JSON.stringify(outputManifest, null, 2)}\n`)
  const isViewModel = /^v_/i.test(manifest.sourceModel)
  let replaced = 0
  for (const texture of manifest.textures) {
    if (!Number.isInteger(texture?.index) || typeof texture.file !== 'string' || path.basename(texture.file) !== texture.file) throw new Error('Unsafe texture filename')
    const input = path.join(sourceDirectory, texture.file)
    const output = path.join(outputDirectory, texture.file)
    if ((isViewModel && texture.index < 3) || /reticle/i.test(texture.name)) { await copyFile(input, output); continue }
    const rgb = waterColors(await readFile(input), texture, pattern)
    await writeFile(output, indexedBmp(rgb, texture.width, texture.height))
    replaced++
  }
  return { outputDirectory, replaced }
}

async function main() {
  const [source, output, pattern] = process.argv.slice(2)
  if (!source || !output) {
    console.error('Usage: node scripts/create-water-ak47-skin.mjs <extracted-texture-folder> <water-skin-folder> [pattern.png]')
    process.exitCode = 1
    return
  }
  const result = await createWaterModelSkin(source, output, pattern)
  console.log(`Created ${result.replaced} water-pattern textures in ${result.outputDirectory}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
