import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { importMdlTextures } from '../../../scripts/import-mdl-textures.mjs'
import { readMdlTextures, textureToBmp } from '../../../scripts/extract-mdl-textures.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
await importMdlTextures({modelPath:path.join(root,'original.mdl'),texturesDirectory:path.join(root,'textures'),outputPath:path.join(root,'ef_gundrop.mdl')})
// Canonicalize BMP headers with the same exporter used for the original.
// Pixels/palettes remain exactly the same; zero DPI fields match the originals.
const model = await readFile(path.join(root,'ef_gundrop.mdl'))
for (const t of readMdlTextures(model)) {
  const bmp = textureToBmp(model,t)
  await writeFile(path.join(root,'textures',`${String(t.index).padStart(3,'0')}_${t.name}`),bmp)
  await writeFile(path.join(root,'decompiled-cs16',t.name),bmp)
}
console.log('Rebuilt ef_gundrop.mdl and canonical 8-bit BMP textures.')
