/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { decodeRgbPng } from './create-water-ak47-skin.mjs'
import { readIndexedBmp } from './import-mdl-textures.mjs'

const PATTERN_PATH = fileURLToPath(new URL('../resources/skin-patterns/desktop-pixel-water.png', import.meta.url))
const PAINTED_PARTS = {
  v_mp5: new Set(['lowerrec.bmp', 'buttstock.bmp', 'clip.bmp', 'forearm.bmp']),
  v_m4a1: new Set(['receiver.bmp', 'magazine.bmp', 'buttstock.bmp']),
  v_scout: new Set(['base.bmp', 'magazine.bmp', 'scope.bmp']),
  v_hegrenade: new Set(['he_body.bmp']),
  v_glock18: new Set(['glock_slide.bmp', 'glock_mag.bmp']),
  v_deagle: new Set(['de_slide1.bmp', 'de_slide2_eagle.bmp']),
  p_mp5: new Set(['w_mp5.bmp']),
  w_mp5: new Set(['w_mp5.bmp']),
  p_m4a1: new Set(['m4a1_skin.bmp']),
  w_m4a1: new Set(['m4a1_skin.bmp']),
  p_scout: new Set(['w_scout.bmp']),
  w_scout: new Set(['w_scout.bmp']),
  p_hegrenade: new Set(['f_body.bmp']),
  w_hegrenade: new Set(['f_body.bmp']),
  p_glock18: new Set(['w_glock18.bmp']),
  w_glock18: new Set(['w_glock18.bmp']),
  p_deagle: new Set(['deserteagle_skin.bmp']),
  w_deagle: new Set(['deserteagle_skin.bmp'])
}
const BACKGROUND_MASKS = new Set(['receiver.bmp', 'base.bmp', 'he_body.bmp'])
const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)))

function externalBackground(pixels, width, height) {
  const border = new Map()
  for (let x = 0; x < width; x++) for (const y of [0, height - 1]) {
    const index = pixels[y * width + x]
    border.set(index, (border.get(index) ?? 0) + 1)
  }
  for (let y = 0; y < height; y++) for (const x of [0, width - 1]) {
    const index = pixels[y * width + x]
    border.set(index, (border.get(index) ?? 0) + 1)
  }
  const [backgroundIndex, count] = [...border].sort((a, b) => b[1] - a[1])[0] ?? []
  const mask = new Uint8Array(width * height)
  if (count < (width + height) * 0.4) return mask
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  const add = (position) => {
    if (mask[position] || pixels[position] !== backgroundIndex) return
    mask[position] = 1
    queue[tail++] = position
  }
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x) }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1) }
  while (head < tail) {
    const position = queue[head++]
    const x = position % width
    const y = Math.floor(position / width)
    if (x > 0) add(position - 1)
    if (x + 1 < width) add(position + 1)
    if (y > 0) add(position - width)
    if (y + 1 < height) add(position + width)
  }
  return mask
}

function colorizeTexture(bmp, texture, pattern, patternScale) {
  const { width, height, pixels, palette } = readIndexedBmp(bmp, texture.file)
  if (width !== texture.width || height !== texture.height) throw new Error(`${texture.file} dimensions changed`)
  const color = Buffer.alloc(width * height * 3)
  const luminance = new Float32Array(width * height)
  const background = BACKGROUND_MASKS.has(texture.name.toLowerCase())
    ? externalBackground(pixels, width, height)
    : new Uint8Array(width * height)
  for (let i = 0; i < pixels.length; i++) {
    const offset = pixels[i] * 3
    luminance[i] = palette[offset] * 0.2126 + palette[offset + 1] * 0.7152 + palette[offset + 2] * 0.0722
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const position = y * width + x
    const original = pixels[position] * 3
    const light = luminance[position]
    if (background[position]) {
      for (let c = 0; c < 3; c++) color[position * 3 + c] = palette[original + c]
      continue
    }
    const lensX = (x - 14.5) / 14
    const lensY = (y - 29) / 18
    if (texture.name.toLowerCase() === 'scope.bmp' && lensX * lensX + lensY * lensY <= 1) {
      // Keep only the Scout's round glass; paint its surrounding atlas with water.
      for (let c = 0; c < 3; c++) {
        color[position * 3 + c] = Math.max([12, 18, 35][c], palette[original + c])
      }
      continue
    }
    const px = (Math.floor(x * patternScale + texture.index * 111) % pattern.width)
    const py = (Math.floor(y * patternScale + texture.index * 79) % pattern.height)
    const source = (py * pattern.width + px) * pattern.channels
    const neighbor = (
      luminance[y * width + Math.max(0, x - 1)] +
      luminance[y * width + Math.min(width - 1, x + 1)] +
      luminance[Math.max(0, y - 1) * width + x] +
      luminance[Math.min(height - 1, y + 1) * width + x]
    ) / 4
    const shape = 0.82 + 0.22 * Math.sqrt(light / 255)
    const edge = (light - neighbor) * 0.15
    for (let c = 0; c < 3; c++) {
      color[position * 3 + c] = Math.max(
        [30, 55, 80][c],
        clamp(pattern.pixels[source + c] * shape + edge)
      )
    }
  }
  return color
}

function finishHardware(bmp, texture, material, swatch) {
  const { width, height, pixels, palette } = readIndexedBmp(bmp, texture.file)
  if (width !== texture.width || height !== texture.height) throw new Error(`${texture.file} dimensions changed`)
  const color = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const position = y * width + x
    const offset = pixels[position] * 3
    const light = palette[offset] * 0.2126 + palette[offset + 1] * 0.7152 + palette[offset + 2] * 0.0722
    if (material === 'matte-white') {
      const matte = clamp(156 + 82 * Math.sqrt(light / 255))
      for (let c = 0; c < 3; c++) color[position * 3 + c] = matte
      continue
    }
    // Sample the central half of each generated swatch: it avoids edge artifacts
    // while retaining the subtle pearl grain or baked blue-glass reflections.
    const sx = Math.floor(swatch.width * (0.25 + 0.5 * (x + 0.5) / width))
    const sy = Math.floor(swatch.height * (0.25 + 0.5 * (y + 0.5) / height))
    const sample = (sy * swatch.width + sx) * swatch.channels
    for (let c = 0; c < 3; c++) {
      if (material === 'frosted-pearl') {
        color[position * 3 + c] = clamp(
          [193, 202, 216][c] + light * 0.17 + (swatch.pixels[sample + c] - 230) * 0.28
        )
      } else {
        color[position * 3 + c] = Math.max(
          [12, 28, 52][c],
          clamp([17, 40, 78][c] + light * [0.13, 0.28, 0.38][c] +
            (swatch.pixels[sample + c] - [20, 50, 105][c]) * 0.45)
        )
      }
    }
  }
  return color
}

function finishWorldTexture(bmp, texture, modelName, pattern, patternScale, material, swatch) {
  const { width, height, pixels } = readIndexedBmp(bmp, texture.file)
  const background = externalBackground(pixels, width, height)
  const water = colorizeTexture(bmp, texture, pattern, patternScale)
  const hardware = finishHardware(bmp, texture, material, swatch)
  const result = Buffer.from(hardware)
  const waterEnd = modelName.endsWith('_m4a1') ? 0.58 : 0.75
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const position = y * width + x
    if (background[position] || x >= width * waterEnd) continue
    water.copy(result, position * 3, position * 3, position * 3 + 3)
  }
  return result
}

function medianCutPalette(rgb) {
  const bins = new Map()
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2]
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bin.n++; bin.r += r; bin.g += g; bin.b += b
    bins.set(key, bin)
  }
  const entries = [...bins.values()].map((bin) => ({
    n: bin.n, r: bin.r / bin.n, g: bin.g / bin.n, b: bin.b / bin.n
  }))
  const boxes = [entries]
  const info = (box) => {
    const range = [0, 1, 2].map((channel) => {
      const name = ['r', 'g', 'b'][channel]
      const values = box.map((entry) => entry[name])
      return Math.max(...values) - Math.min(...values)
    })
    const axis = range.indexOf(Math.max(...range))
    const weight = box.reduce((sum, entry) => sum + entry.n, 0)
    return { axis, weight, score: range[axis] * Math.sqrt(weight) }
  }
  while (boxes.length < 256) {
    let target = -1
    let score = -1
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue
      const next = info(boxes[i]).score
      if (next > score) { score = next; target = i }
    }
    if (target < 0) break
    const box = boxes[target]
    const { axis, weight } = info(box)
    const name = ['r', 'g', 'b'][axis]
    box.sort((a, b) => a[name] - b[name])
    let midpoint = 1
    let total = box[0].n
    while (midpoint < box.length - 1 && total < weight / 2) total += box[midpoint++].n
    boxes.splice(target, 1, box.slice(0, midpoint), box.slice(midpoint))
  }
  const palette = boxes.map((box) => {
    const weight = box.reduce((sum, entry) => sum + entry.n, 0)
    return [0, 1, 2].map((channel) =>
      box.reduce((sum, entry) => sum + entry[['r', 'g', 'b'][channel]] * entry.n, 0) / weight
    )
  })
  while (palette.length < 256) palette.push([0, 0, 0])
  return palette
}

function encodeBmp(rgb, width, height) {
  const palette = medianCutPalette(rgb)
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
    const position = y * width + x
    const r = rgb[position * 3], g = rgb[position * 3 + 1], b = rgb[position * 3 + 2]
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)
    let choice = cache.get(key)
    if (choice === undefined) {
      let best = Infinity
      for (let i = 0; i < 256; i++) {
        const dr = r - palette[i][0], dg = g - palette[i][1], db = b - palette[i][2]
        const distance = dr * dr + dg * dg + db * db
        if (distance < best) { best = distance; choice = i }
      }
      cache.set(key, choice)
    }
    bmp[pixelOffset + (height - 1 - y) * stride + x] = choice
  }
  return bmp
}

/** Rebuilds selected weapon textures with pixel water and a hardware finish. */
export async function createRefinedWaterViewSkin(sourceDirectory, outputDirectory, patternPath = PATTERN_PATH, patternScale = 2.2, material = 'matte-white', swatchPath) {
  if (!Number.isFinite(patternScale) || patternScale <= 0) throw new Error('Pattern scale must be positive')
  if (!['matte-white', 'frosted-pearl', 'dark-navy-glass'].includes(material)) throw new Error('Unsupported hardware material')
  if (material !== 'matte-white' && !swatchPath) throw new Error('Material swatch PNG is required')
  const manifest = JSON.parse(await readFile(path.join(sourceDirectory, 'textures.json'), 'utf8'))
  const modelName = path.parse(manifest.sourceModel).name.toLowerCase()
  const painted = PAINTED_PARTS[modelName]
  if (manifest.format !== 'goldsrc-mdl-textures-v1' || !Array.isArray(manifest.textures) || !painted) {
    throw new Error('Unsupported extracted model texture set')
  }
  const pattern = decodeRgbPng(await readFile(patternPath))
  const swatch = swatchPath ? decodeRgbPng(await readFile(swatchPath)) : null
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(path.join(outputDirectory, 'textures.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  let changed = 0
  for (const texture of manifest.textures) {
    if (!Number.isInteger(texture?.index) || typeof texture.file !== 'string' || path.basename(texture.file) !== texture.file) {
      throw new Error('Invalid texture entry')
    }
    const source = path.join(sourceDirectory, texture.file)
    const output = path.join(outputDirectory, texture.file)
    if (modelName.startsWith('v_') && texture.index < 3) { await copyFile(source, output); continue }
    const bmp = await readFile(source)
    const rgb = (modelName.startsWith('p_') || modelName.startsWith('w_')) && painted.has(texture.name.toLowerCase())
      ? finishWorldTexture(bmp, texture, modelName, pattern, patternScale, material, swatch)
      : painted.has(texture.name.toLowerCase())
      ? colorizeTexture(bmp, texture, pattern, patternScale)
      : finishHardware(bmp, texture, material, swatch)
    await writeFile(output, encodeBmp(rgb, texture.width, texture.height))
    changed++
  }
  return { modelName, outputDirectory, changed }
}

async function main() {
  const [source, output, pattern, scale, material, swatch] = process.argv.slice(2)
  if (!source || !output) {
    console.error('Usage: node scripts/create-refined-water-view-skin.mjs <extracted-v-textures> <output-folder> [pattern.png] [pattern-scale] [material] [material-swatch.png]')
    process.exitCode = 1
    return
  }
  const result = await createRefinedWaterViewSkin(source, output, pattern, scale === undefined ? 2.2 : Number(scale), material, swatch)
  console.log(`${result.modelName}: painted ${result.changed} textures in ${result.outputDirectory}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
