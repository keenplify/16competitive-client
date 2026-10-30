import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  root: resolve(__dirname, '..'),
  plugins: [react(), tailwindcss()],
  define: {
    __MUSIC_PREVIEW_MODEL_ROOT__: JSON.stringify(
      '/@fs' + resolve(__dirname, '../../16competitive/cs16-legacy/cstrike/models')
    )
  },
  resolve: { extensions: ['.mjs', '.mts', '.ts', '.tsx', '.js', '.jsx', '.json'] },
  server: { host: '127.0.0.1', fs: { allow: [resolve(__dirname, '../..')] } },
  assetsInclude: ['**/*.mdl']
})
