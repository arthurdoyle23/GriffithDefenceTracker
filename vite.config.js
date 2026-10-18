import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The site is served from https://arthurdoyle23.github.io/GriffithDefenceTracker/
  base: '/GriffithDefenceTracker/',
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // Keep the map engine in its own file so browsers can cache it between releases.
      output: { manualChunks: { maplibre: ['maplibre-gl'] } },
    },
  },
})
