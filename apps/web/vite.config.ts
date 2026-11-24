import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin, type UserConfig } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

/** モック以外のビルドから MSW の Service Worker を除外する */
function excludeMockWorker(useMock: boolean): Plugin {
  return {
    name: 'exclude-mock-worker',
    apply: 'build',
    closeBundle() {
      if (!useMock)
        rmSync(fileURLToPath(new URL('./dist/mockServiceWorker.js', import.meta.url)), {
          force: true,
        })
    },
  }
}

export function createViteConfig(mode: string): UserConfig {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  return {
    // GitHub Pages のプロジェクト URL（https://kyonan-sc.github.io/player-assessment/）
    base: env.VITE_BASE ?? '/player-assessment/',
    plugins: [react(), tailwindcss(), excludeMockWorker(env.VITE_USE_MOCK === 'true')],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5173 },
    build: { sourcemap: false },
  }
}

export default defineConfig(({ mode }) => createViteConfig(mode))
