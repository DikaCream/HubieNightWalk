import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Single static bundle with the art inlined, so the build can be uploaded as is.
export default defineConfig({
  plugins: [react()],
  build: { assetsInlineLimit: 10_000_000, chunkSizeWarningLimit: 2500, rolldownOptions: { output: { codeSplitting: false } } },
})
