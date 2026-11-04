import { build } from 'esbuild'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
const target = new URL('../web-helper/assets/sticker-baker.js', import.meta.url)
const result = await build({
  entryPoints: [new URL('./native-sticker-baker.ts', import.meta.url).pathname],
  bundle: true,
  format: 'iife',
  globalName: 'StickerBaker',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  logOverride: { 'tsconfig.json': 'silent' },
  target: 'es2020',
  minify: true,
  write: false
})
const bytes = result.outputFiles[0].contents
if (process.argv.includes('--check')) {
  if (!Buffer.from(bytes).equals(await readFile(target)))
    throw new Error('Run node scripts/build-native-sticker-baker.mjs')
} else {
  await mkdir(new URL('../web-helper/assets/', import.meta.url), { recursive: true })
  await writeFile(target, bytes)
}
