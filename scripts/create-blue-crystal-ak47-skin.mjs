import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { readIndexedBmp } from './import-mdl-textures.mjs'

// Hands and the HUD reticle belong to the view model, not the weapon finish.
const WEAPON_TEXTURE_INDEXES = new Set([3, 4, 5, 6, 7, 9, 10])
const PALETTE_OFFSET = 54
const NF_ADDITIVE = 0x0020

function blueCrystalPalette(bmp) {
  const output = Buffer.from(bmp)
  for (let index = 0; index < 256; index++) {
    const offset = PALETTE_OFFSET + index * 4
    const blue = bmp[offset]
    const green = bmp[offset + 1]
    const red = bmp[offset + 2]
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
    const highlight = Math.max(0, (luminance - 150) / 105)

    // Retains the original shading while shifting each material to the deep
    // navy/cobalt finish of the supplied Blue Crystal reference. BMP palettes
    // are BGR0, hence the reversed channel assignment below.
    output[offset] = Math.round(Math.min(255, 30 + luminance * 0.62 + highlight * 48))
    output[offset + 1] = Math.round(Math.min(255, 10 + luminance * 0.25 + highlight * 24))
    output[offset + 2] = Math.round(Math.min(255, 2 + luminance * 0.08 + highlight * 12))
  }
  return output
}

/**
 * Creates a non-destructive blue-crystal AK-47 skin folder from an extraction folder.
 * It keeps every BMP's original size, indexed pixels, and only remaps the weapon palettes.
 */
export async function createBlueCrystalAk47Skin(sourceDirectory, outputDirectory) {
  const manifestPath = path.join(sourceDirectory, 'textures.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.format !== 'goldsrc-mdl-textures-v1' || !Array.isArray(manifest.textures)) {
    throw new Error('Blue crystal skin: source folder must contain a textures.json extraction manifest')
  }

  await mkdir(outputDirectory, { recursive: true })
  const outputManifest = {
    ...manifest,
    textures: manifest.textures.map((texture) => {
      // GoldSrc additive blending has no fractional alpha; using it for the
      // weapon or reticle makes the material ghost through the scene.
      return { ...texture, flags: texture.flags & ~NF_ADDITIVE }
    })
  }
  await writeFile(path.join(outputDirectory, 'textures.json'), `${JSON.stringify(outputManifest, null, 2)}\n`)
  let recolored = 0
  for (const texture of manifest.textures) {
    if (!Number.isInteger(texture?.index) || typeof texture.file !== 'string' || path.basename(texture.file) !== texture.file) {
      throw new Error('Blue crystal skin: invalid texture entry in textures.json')
    }
    const sourcePath = path.join(sourceDirectory, texture.file)
    const destinationPath = path.join(outputDirectory, texture.file)
    if (!WEAPON_TEXTURE_INDEXES.has(texture.index)) {
      await copyFile(sourcePath, destinationPath)
      continue
    }
    const bmp = await readFile(sourcePath)
    readIndexedBmp(bmp, texture.file) // validate before preserving its binary layout
    await writeFile(destinationPath, blueCrystalPalette(bmp))
    recolored++
  }
  return { outputDirectory, recolored }
}

async function main() {
  const [sourceDirectory, outputDirectory] = process.argv.slice(2)
  if (!sourceDirectory || !outputDirectory) {
    console.error('Usage: node scripts/create-blue-crystal-ak47-skin.mjs <extracted-texture-folder> <blue-crystal-folder>')
    process.exitCode = 1
    return
  }
  const result = await createBlueCrystalAk47Skin(sourceDirectory, outputDirectory)
  console.log(`Created ${result.recolored} blue-crystal weapon textures in ${result.outputDirectory}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
