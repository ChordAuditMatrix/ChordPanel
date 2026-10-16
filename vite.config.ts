import { defineConfig, loadEnv } from 'vite'
import Components from 'unplugin-vue-components/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// Dev proxy target for '/api' requests. The Vite dev server itself stays bound
// to localhost; only the proxied backend location is configurable.
// Override via VITE_DEV_PROXY_TARGET (shell env or .env files, see .env.example).
const DEFAULT_DEV_PROXY_TARGET = 'http://127.0.0.1:8080'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_')
  const devProxyTarget = (env.VITE_DEV_PROXY_TARGET || DEFAULT_DEV_PROXY_TARGET).replace(/\/+$/, '')

  return {
    plugins: [vue(), Components({ dirs: [], resolvers: [NaiveUiResolver()], dts: 'src/components.d.ts' })],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      host: 'localhost',
      port: 5173,
      proxy: {
        '/api': {
          target: devProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
