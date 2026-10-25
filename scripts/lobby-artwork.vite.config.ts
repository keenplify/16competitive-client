import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, '..'),
  resolve: {
    extensions: ['.mjs', '.mts', '.ts', '.tsx', '.js', '.jsx', '.json'],
    dedupe: ['react', 'react-dom', 'three'],
    alias: {
      three: resolve(__dirname, '../node_modules/three/build/three.module.js')
    }
  },
  plugins: [react()],
  optimizeDeps: { exclude: ['three'] },
  assetsInclude: ['**/*.mdl']
})
