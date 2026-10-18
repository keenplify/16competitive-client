import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    extensions: ['.mjs', '.mts', '.ts', '.tsx', '.js', '.jsx', '.json'],
    dedupe: ['react', 'react-dom', 'styled-components', 'three', 'react-dropzone'],
    alias: { three: resolve('node_modules/three/build/three.module.js') }
  },
  optimizeDeps: { exclude: ['three'] },
  define: { __SIXTEEN_COMPETITIVE_VERSION__: JSON.stringify('preview') },
  server: { host: '127.0.0.1', port: 5191, strictPort: true }
})
