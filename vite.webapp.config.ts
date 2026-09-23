import { cp, copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const webAssets = {
  name: '16competitive-web-assets',
  async closeBundle(): Promise<void> {
    const output = resolve('dist-web')
    await mkdir(resolve(output, 'lobby-models'), { recursive: true })
    await cp(resolve('resources/lobby-models'), resolve(output, 'lobby-models'), { recursive: true })
    await copyFile(resolve('src/web/site.webmanifest'), resolve(output, 'site.webmanifest'))
    await copyFile(resolve('src/web/sw.js'), resolve(output, 'sw.js'))
  }
}

export default defineConfig({
  root: resolve('src/web'),
  base: '/pwa/',
  publicDir: resolve('src/renderer/public'),
  resolve: {
    extensions: ['.mjs', '.mts', '.ts', '.tsx', '.js', '.jsx', '.json'],
    dedupe: ['react', 'react-dom', 'styled-components', 'three', 'react-dropzone'],
    alias: {
      '@renderer': resolve('src/renderer/src'),
      three: resolve('node_modules/three/build/three.module.js')
    }
  },
  plugins: [react(), tailwindcss(), webAssets],
  optimizeDeps: {
    exclude: ['three']
  },
  assetsInclude: ['**/*.mdl'],
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true
  }
})
