import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['three']
  },
  assetsInclude: ['**/*.mdl'],
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true
  }
})
