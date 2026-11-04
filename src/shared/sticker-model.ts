/** Match hand-material tokens, never weapon names such as handle.bmp. */
export function isHandTexture(name: string): boolean {
  return /(?:^|[^a-z0-9])(?:gloves?|fingers?|skin|hands?|sleeves?)(?:[^a-z0-9]|$)/i.test(name)
}

/** Private AK-47 editor: immutable, palette-preserving IDST v10 texture baking. */
export type StickerPixels = { width: number; height: number; rgba: Uint8Array }
export type StickerPlacement = {
  texture: number
  u: number
  v: number
  size: number
  angle: number
}
export type StickerTexture = {
  name: string
  flags: number
  width: number
  height: number
  offset: number
}

export function modelTextures(bytes: Uint8Array): StickerTexture[] {
  if (bytes.length < 244 || bytes.length > 16 * 1024 * 1024) throw new Error('model')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    view.getUint32(0, true) !== 0x54534449 ||
    view.getInt32(4, true) !== 10 ||
    view.getInt32(72, true) !== bytes.length
  )
    throw new Error('model')
  const count = view.getInt32(180, true),
    start = view.getInt32(184, true)
  if (count < 1 || count > 128 || start < 244 || start + count * 80 > bytes.length)
    throw new Error('model')
  const spans: [number, number][] = []
  return Array.from({ length: count }, (_, i) => {
    const at = start + i * 80
    const width = view.getInt32(at + 68, true),
      height = view.getInt32(at + 72, true),
      offset = view.getInt32(at + 76, true)
    const end = offset + width * height + 768
    if (
      width < 1 ||
      height < 1 ||
      width > 2048 ||
      height > 2048 ||
      offset < 244 ||
      (offset < start + count * 80 && end > start) ||
      end > bytes.length ||
      spans.some(([a, b]) => offset < b && end > a)
    )
      throw new Error('model')
    spans.push([offset, end])
    return {
      name: new TextDecoder().decode(bytes.subarray(at, at + 64)).split('\0')[0],
      flags: view.getInt32(at + 64, true),
      width,
      height,
      offset
    }
  })
}

export function texturePixels(bytes: Uint8Array, texture: StickerTexture): Uint8ClampedArray {
  const { width, height, offset } = texture
  const pixels = new Uint8ClampedArray(width * height * 4),
    palette = offset + width * height
  for (let i = 0; i < width * height; i++) {
    const p = palette + bytes[offset + i] * 3
    pixels.set([bytes[p], bytes[p + 1], bytes[p + 2], 255], i * 4)
  }
  return pixels
}

export function validatePlacement(value: unknown): StickerPlacement {
  if (!value || typeof value !== 'object') throw new Error('placement')
  const p = value as StickerPlacement
  if (
    !Number.isInteger(p.texture) ||
    p.texture < 0 ||
    p.texture > 127 ||
    ![p.u, p.v, p.size, p.angle].every(Number.isFinite) ||
    p.u < 0 ||
    p.u > 1 ||
    p.v < 0 ||
    p.v > 1 ||
    p.size < 0.02 ||
    p.size > 1 ||
    p.angle < -180 ||
    p.angle > 180
  )
    throw new Error('placement')
  return { texture: p.texture, u: p.u, v: p.v, size: p.size, angle: p.angle }
}

/** Reserve up to 32 palette entries for decal colors. Remap only pixels using those
 * least-used entries; geometry, animations and unrelated textures stay byte-identical. */
export function bakeSticker(
  source: Uint8Array,
  sticker: StickerPixels,
  value: unknown
): Uint8Array {
  const p = validatePlacement(value),
    textures = modelTextures(source),
    t = textures[p.texture]
  if (!t || (t.flags & (2 | 32 | 64)) !== 0) throw new Error('surface')
  if (
    !Number.isInteger(sticker.width) ||
    !Number.isInteger(sticker.height) ||
    sticker.width < 1 ||
    sticker.height < 1 ||
    sticker.width > 512 ||
    sticker.height > 512 ||
    sticker.rgba.length !== sticker.width * sticker.height * 4
  )
    throw new Error('image')
  const output = source.slice(),
    area = t.width * t.height,
    palette = t.offset + area
  const counts = new Uint32Array(256)
  for (const index of source.subarray(t.offset, palette)) counts[index]++
  const free = Array.from({ length: 256 }, (_, i) => i)
    .sort((a, b) => counts[a] - counts[b])
    .slice(0, 32)
  const reserved = new Set(free),
    used = new Set(Array.from({ length: 256 }, (_, i) => i).filter((i) => !reserved.has(i)))
  const remap = new Map<number, number>()
  for (const index of free) {
    let best = Infinity,
      replacement = 0
    for (const i of used) {
      const d = [0, 1, 2].reduce(
        (sum, c) => sum + (source[palette + index * 3 + c] - source[palette + i * 3 + c]) ** 2,
        0
      )
      if (d < best) {
        best = d
        replacement = i
      }
    }
    remap.set(index, replacement)
  }
  for (let i = t.offset; i < palette; i++)
    if (reserved.has(output[i])) output[i] = remap.get(output[i])!
  const colors = new Map<number, number>()
  for (let i = 0; i < 256; i++)
    if (used.has(i))
      colors.set(
        (source[palette + i * 3] << 16) |
          (source[palette + i * 3 + 1] << 8) |
          source[palette + i * 3 + 2],
        i
      )
  const nearest = (r: number, g: number, b: number): number => {
    const key = (r << 16) | (g << 8) | b,
      cached = colors.get(key)
    if (cached !== undefined) return cached
    let index = free.shift()
    if (index !== undefined) {
      output.set([r, g, b], palette + index * 3)
      used.add(index)
    } else {
      let best = Infinity
      index = 0
      for (const i of used) {
        const d =
          (r - output[palette + i * 3]) ** 2 +
          (g - output[palette + i * 3 + 1]) ** 2 +
          (b - output[palette + i * 3 + 2]) ** 2
        if (d < best) {
          best = d
          index = i
        }
      }
    }
    colors.set(key, index)
    return index
  }
  const width = p.size * t.width,
    height = (width * sticker.height) / sticker.width
  const a = (p.angle * Math.PI) / 180,
    cos = Math.cos(a),
    sin = Math.sin(a)
  for (let y = 0; y < t.height; y++)
    for (let x = 0; x < t.width; x++) {
      // UVs are bottom-origin; texture byte rows are top-origin.
      const dx = x + 0.5 - p.u * t.width,
        dy = y + 0.5 - (1 - p.v) * t.height
      const sx = Math.floor(((dx * cos + dy * sin) / width + 0.5) * sticker.width)
      const sy = Math.floor(((-dx * sin + dy * cos) / height + 0.5) * sticker.height)
      if (sx < 0 || sy < 0 || sx >= sticker.width || sy >= sticker.height) continue
      const at = (sy * sticker.width + sx) * 4,
        alpha = sticker.rgba[at + 3] / 255
      if (!alpha) continue
      const pixel = t.offset + y * t.width + x,
        old = palette + source[pixel] * 3
      output[pixel] = nearest(
        ...([0, 1, 2].map((c) =>
          Math.round(source[old + c] * (1 - alpha) + sticker.rgba[at + c] * alpha)
        ) as [number, number, number])
      )
    }
  return output
}

/** High-contrast geometric test decal, authored as pixels; no external assets. */
export function testSticker(): StickerPixels {
  const width = 64,
    rgba = new Uint8Array(width * width * 4)
  for (let y = 4; y < 60; y++)
    for (let x = 4; x < 60; x++) {
      const border = x < 8 || x > 55 || y < 8 || y > 55
      const cross = (x >= 28 && x <= 35) || (y >= 28 && y <= 35)
      rgba.set(border || cross ? [255, 245, 215, 255] : [230, 55, 30, 255], (y * width + x) * 4)
    }
  return { width, height: width, rgba }
}
