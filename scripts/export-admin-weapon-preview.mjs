import { build } from 'esbuild'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

// Export the actual launcher inspection renderer; the admin never forks camera/mesh logic.
const output = resolve('../16competitive-admin/src/vendor/weapon-preview')
await mkdir(output, { recursive: true })
await build({
  stdin: {
    contents:
      "export { StickerViewport as default } from './src/renderer/src/features/sticker-editor/StickerViewport'",
    resolveDir: process.cwd(),
    loader: 'ts'
  },
  outfile: resolve(output, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  external: ['react', 'react/jsx-runtime'],
  jsx: 'automatic',
  legalComments: 'eof',
  plugins: [
    {
      name: 'admin-owned-localization',
      setup(build) {
        build.onResolve({ filter: /inventory-i18n$/ }, () => ({
          path: 'admin-preview-text',
          namespace: 'admin-preview-text'
        }))
        build.onLoad({ filter: /.*/, namespace: 'admin-preview-text' }, () => ({
          contents: 'export const useInventoryText = () => () => "";',
          loader: 'js'
        }))
      }
    }
  ]
})
await writeFile(
  resolve(output, 'index.d.ts'),
  `import type { ComponentType } from 'react'\ndeclare const Preview: ComponentType<{ label: string; firstPerson?: boolean; highlightInspectionSide?: boolean; previewModel: ArrayBuffer; weaponKey?: string; stockModel?: boolean; presentationRotation?: readonly [number, number, number]; hiddenTextures?: readonly string[]; onError?: () => void; onFirstFrame?: (canvas: HTMLCanvasElement) => void }>\nexport default Preview\n`
)
const license = await readFile('src/renderer/src/libs/web-hlmv/LICENSE', 'utf8').catch(
  () => 'See the web-hlmv upstream license and bundled dependency notices in index.js.'
)
await writeFile(
  resolve(output, 'README.md'),
  `Generated from 16competitive-client using scripts/export-admin-weapon-preview.mjs. Do not edit index.js directly. Regenerate after launcher inspection changes. React is supplied by the admin app; renderer dependencies are bundled.\n\nSource base commit: ${execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()} (includes working-tree changes).\n\n${license}\n`
)
