import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'web'),
  plugins: [react()],
  publicDir: resolve(__dirname, 'web/public'),
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true
  }
})
