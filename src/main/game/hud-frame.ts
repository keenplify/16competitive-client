import type { NativeImage } from 'electron'

/** Offscreen paint dimensions are physical pixels, independent of window DIP size. */
export const encodeHudFrame = (
  image: NativeImage,
  width: number,
  height: number,
  maxBytes: number
): Buffer | null => {
  if (image.isEmpty()) return null
  const size = image.getSize()
  const normalized =
    size.width === width && size.height === height
      ? image
      : image.resize({ width, height, quality: 'good' })
  const png = normalized.toPNG({ scaleFactor: 1 })
  return png.length > 0 && png.length <= maxBytes ? png : null
}
