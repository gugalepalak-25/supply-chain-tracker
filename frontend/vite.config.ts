import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

const assertShim = fileURLToPath(new URL('./src/shims/assert.ts', import.meta.url))

// The frontend talks to the Midnight network directly: public indexer for
// reads, the connected Lace wallet for proving/balancing/submission. No API
// backend. The Midnight SDK ships WASM (onchain-runtime, ledger), which needs
// the wasm + top-level-await plugins and the resolver glue below.
export default defineConfig({
  cacheDir: './.vite',
  plugins: [
    react(),
    wasm(),
    topLevelAwait({
      promiseExportName: '__tla',
      promiseImportName: (i) => `__tla_${i}`,
    }),
    {
      name: 'wasm-module-resolver',
      resolveId(source, importer) {
        if (
          source === '@midnight-ntwrk/onchain-runtime-v3' &&
          importer &&
          importer.includes('@midnight-ntwrk/compact-runtime')
        ) {
          return { id: source, external: false, moduleSideEffects: true }
        }
        return null
      },
    },
  ],
  build: {
    target: 'esnext',
    minify: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('onchain-runtime-v3')) return 'wasm'
        },
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: ['.js', '.cjs'],
      ignoreDynamicRequires: true,
    },
  },
  optimizeDeps: {
    rolldownOptions: {
      platform: 'browser',
      moduleTypes: { '.wasm': 'binary' },
    },
    include: ['@midnight-ntwrk/compact-runtime'],
    exclude: [
      '@midnight-ntwrk/onchain-runtime-v3',
      '@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm_bg.wasm',
      '@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm.js',
    ],
  },
  resolve: {
    alias: {
      // Node `assert` is used by @subsquid/scale-codec for bech32m address
      // decoding; provide a tiny browser-safe implementation.
      assert: assertShim,
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'],
    mainFields: ['browser', 'module', 'main'],
  },
  server: {
    port: 3000,
    open: true,
    fs: {
      // Allow importing the compiled contract from the repo root.
      allow: ['..'],
    },
  },
})
