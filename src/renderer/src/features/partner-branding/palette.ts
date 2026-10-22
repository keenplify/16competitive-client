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

const mix = (hex: string, target: string, amount: number): string =>
  `#${[1, 3, 5]
    .map((offset) =>
      Math.round(
        Number.parseInt(hex.slice(offset, offset + 2), 16) * (1 - amount) +
          Number.parseInt(target.slice(offset, offset + 2), 16) * amount
      )
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`

/** Dark VGUI surfaces and readable accents for arbitrary community colors. */
export const vguiPalette = (colors: {
  primaryColor: string
  secondaryColor: string
  tertiaryColor: string
}): Record<string, string> => {
  const face = actionColor(colors.secondaryColor)
  const inset = mix(actionColor(colors.tertiaryColor), '#000000', 0.3)
  const light = mix(face, '#ffffff', 0.8)
  const dark = mix(inset, '#000000', 0.4)
  const onSurface = (color: string): string => {
    const surfaceLuminance = Math.max(
      1.05 / contrastOnWhite(face) - 0.05,
      1.05 / contrastOnWhite(inset) - 0.05
    )
    for (let amount = 0; amount <= 1; amount += 0.02) {
      const candidate = mix(color, '#ffffff', amount)
      const luminance = 1.05 / contrastOnWhite(candidate) - 0.05
      if ((luminance + 0.05) / (surfaceLuminance + 0.05) >= 4.5) return candidate
    }
    return '#ffffff'
  }
  const accent = onSurface(colors.primaryColor)
  const result: Record<string, string> = {
    '--vgui-face': face,
    '--vgui-inset': inset,
    '--vgui-light': light,
    '--vgui-dark': dark,
    '--vgui-text': '#ffffff',
    '--vgui-accent': accent,
    '--color-white': '#ffffff',
    '--color-black': dark
  }
  for (const family of ['neutral', 'slate', 'gray', 'zinc', 'stone']) {
    for (const step of [50, 100, 200, 300, 400, 500, 600]) {
      result[`--color-${family}-${step}`] = onSurface(mix(face, '#ffffff', 1 - step / 1000))
    }
    for (const step of [700, 800]) result[`--color-${family}-${step}`] = face
    result[`--color-${family}-900`] = mix(face, inset, 0.5)
    result[`--color-${family}-950`] = inset
  }
  for (const family of ['sky', 'blue', 'cyan', 'violet', 'indigo']) {
    for (const step of [50, 100, 200, 300, 400, 500]) {
      result[`--color-${family}-${step}`] = onSurface(mix(accent, '#ffffff', (500 - step) / 600))
    }
    for (const step of [600, 700, 800, 900, 950]) {
      result[`--color-${family}-${step}`] = mix(
        actionColor(colors.primaryColor),
        inset,
        (step - 600) / 400
      )
    }
  }
  return result
}
