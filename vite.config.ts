import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: { assetsInlineLimit: 10_000_000, rollupOptions: { output: { inlineDynamicImports: true } } },
})
