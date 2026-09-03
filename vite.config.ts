import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Split the two heavy, rarely-changing dependency trees into their own
        // chunks. They then stay cached across app deploys instead of being
        // re-downloaded every time a page changes.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) {
            return 'charts'
          }
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
            return 'react'
          }
        },
      },
    },
  },
})
