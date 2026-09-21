import { resolve } from 'path'
import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import vitePluginBundleObfuscator from 'vite-plugin-bundle-obfuscator'

const developmentContentSecurityPolicy =
  "default-src 'self'; script-src 'self' 'unsafe-eval'; connect-src 'self' http: ws: https://mastodon.social; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: http:"

const developmentCsp = {
  name: 'development-csp',
  transformIndexHtml(html: string, context: { server?: unknown }): string {
    if (!context.server) {
      return html
    }

    return html.replace(
      "default-src 'self'; script-src 'self'; connect-src 'self' https://mastodon.social; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:",
      developmentContentSecurityPolicy
    )
  }
}

const mainProcessEnvNames = [
  'API_BASE_URL',
  'MATCHMAKING_WS_URL',
  'DISCORD_CLIENT_ID',
  'DISCORD_LARGE_IMAGE_KEY',
  // Optional escape hatch for sandboxed Discord clients or custom arRPC setups.
  // This stays in the main bundle and is never exposed to the renderer.
  'DISCORD_IPC_PATH'
] as const
type MainProcessEnvName = (typeof mainProcessEnvNames)[number]

const productionMainProcessEnv: Partial<Record<MainProcessEnvName, string>> = {
  API_BASE_URL: 'https://16competitive.papamo.dev',
  MATCHMAKING_WS_URL: 'wss://16competitive.papamo.dev/matchmaking/ws'
}

export default defineConfig(({ mode }) => {
  // API endpoints are compiled into the trusted main-process bundle only.
  // They intentionally do not use VITE_* and are unavailable to the renderer.
  // Public release builds have safe production defaults so a missing optional
  // GitHub environment override cannot silently package the localhost API.
  const env = loadEnv(mode, process.cwd(), '')
  const mainProcessEnv = Object.fromEntries(
    mainProcessEnvNames.flatMap((name) => {
      const value =
        process.env[name] ||
        env[name] ||
        (mode === 'production' ? productionMainProcessEnv[name] : '')

      return value ? [[`process.env.${name}`, JSON.stringify(value)]] : []
    })
  )

  return {
    main: { define: mainProcessEnv },
    preload: {},
    renderer: {
      resolve: {
        extensions: ['.mjs', '.mts', '.ts', '.tsx', '.js', '.jsx', '.json'],
        // web-hlmv was vendored with an old React 16 dependency tree. Resolve
        // these packages once from the launcher to avoid mixing React runtimes
        // and stale Vite-optimized dependency modules in the renderer.
        dedupe: ['react', 'react-dom', 'styled-components', 'three', 'react-dropzone'],
        alias: {
          '@renderer': resolve('src/renderer/src'),
          // Three checks objects with instanceof internally. Every viewer module
          // must therefore receive this exact module instance.
          three: resolve('node_modules/three/build/three.module.js')
        }
      },
      plugins: [developmentCsp, react(), tailwindcss(), vitePluginBundleObfuscator()],
      // Do not prebundle a second copy that can bypass the explicit alias above.
      optimizeDeps: {
        exclude: ['three']
      },
      assetsInclude: ['**/*.mdl']
    }
  }
})
