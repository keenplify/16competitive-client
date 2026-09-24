export type SpriteFrame = { width: number; height: number; pixels: Uint8ClampedArray }

const MAX_PIXELS = 16_000_000

/** Decode the 8-bit paletted GoldSrc SPR frames used by grenade explosions. */
export function decodeExplosionSprite(buffer: ArrayBuffer): SpriteFrame[] {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const requireBytes = (offset: number, length: number): void => {
    if (offset < 0 || length < 0 || offset + length > bytes.length) {
      throw new Error('Truncated explosion sprite')
    }
  }
  requireBytes(0, 42)
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'IDSP' || view.getInt32(4, true) !== 2) {
    throw new Error('Unsupported explosion sprite')
  }
  const textureFormat = view.getInt32(12, true)
  const frameCount = view.getInt32(28, true)
  if (textureFormat < 0 || textureFormat > 3 || frameCount < 1 || frameCount > 128) {
    throw new Error('Unsupported explosion sprite format')
  }
  const paletteSize = view.getUint16(40, true)
  if (paletteSize !== 256) throw new Error('Unsupported explosion sprite palette')
  const paletteOffset = 42
  requireBytes(paletteOffset, paletteSize * 3)
  let offset = paletteOffset + paletteSize * 3
  let totalPixels = 0
  const frames: SpriteFrame[] = []

  const readFrame = (): void => {
    requireBytes(offset, 16)
    const width = view.getInt32(offset + 8, true)
    const height = view.getInt32(offset + 12, true)
    offset += 16
    if (width < 1 || height < 1 || width > 2048 || height > 2048) {
      throw new Error('Unsupported explosion sprite dimensions')
    }
    const count = width * height
    totalPixels += count
    if (totalPixels > MAX_PIXELS) throw new Error('Explosion sprite has too many pixels')
    requireBytes(offset, count)
    const pixels = new Uint8ClampedArray(count * 4)
    for (let i = 0; i < count; i += 1) {
      const index = bytes[offset + i]!
      const color = paletteOffset + index * 3
      const red = bytes[color]!
      const green = bytes[color + 1]!
      const blue = bytes[color + 2]!
      const target = i * 4
      pixels[target] = red
      pixels[target + 1] = green
      pixels[target + 2] = blue
      pixels[target + 3] =
        textureFormat === 1
          ? Math.max(red, green, blue)
          : textureFormat === 2
            ? index
            : textureFormat === 3 && index === 255
              ? 0
              : 255
    }
    frames.push({ width, height, pixels })
    offset += count
  }

  for (let i = 0; i < frameCount; i += 1) {
    requireBytes(offset, 4)
    const frameType = view.getInt32(offset, true)
    offset += 4
    if (frameType === 0) {
      readFrame()
    } else if (frameType === 1) {
      requireBytes(offset, 4)
      const groupCount = view.getInt32(offset, true)
      offset += 4
      if (groupCount < 1 || groupCount > 128) throw new Error('Invalid sprite frame group')
      requireBytes(offset, groupCount * 4)
      offset += groupCount * 4
      for (let groupFrame = 0; groupFrame < groupCount; groupFrame += 1) readFrame()
    } else {
      throw new Error('Unsupported explosion sprite frame type')
    }
  }
  return frames
}
