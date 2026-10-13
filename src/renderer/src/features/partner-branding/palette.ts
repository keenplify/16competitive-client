const srgb = (value: number): number => {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

const contrastOnWhite = (hex: string): number => {
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  const luminance = 0.2126 * srgb(red) + 0.7152 * srgb(green) + 0.0722 * srgb(blue)
  return 1.05 / (luminance + 0.05)
}

// Solid controls use white labels. Darken a supplied color only as much as
// needed to preserve readable labels across arbitrary partner palettes.
export const actionColor = (hex: string): string => {
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  for (let factor = 1; factor >= 0; factor -= 0.02) {
    const color = `#${[red, green, blue]
      .map((channel) =>
        Math.round(channel * factor)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')}`
    if (contrastOnWhite(color) >= 4.5) return color
  }
  return '#000000'
}
