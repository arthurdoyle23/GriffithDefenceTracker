import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative paths, so the build works at https://arthurdoyle23.github.io/GriffithDefenceTracker/
  // whatever the letter case of the address, and from any other folder.
  base: './',
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // Keep the map engine in its own file so browsers can cache it between releases.
      output: { manualChunks: { maplibre: ['maplibre-gl'] } },
    },
  },
})
