import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // No manual chunk splitting: pulling recharts and React into separate
  // vendor chunks previously produced a build where the recharts chunk could
  // execute before React had finished initializing, crashing the whole app in
  // production ("Cannot read properties of undefined (reading 'forwardRef')")
  // while looking fine in dev, where nothing is chunked. Rollup's default
  // chunking keeps every eagerly-loaded dependency's execution order correct;
  // per-page code splitting (see the lazy() imports in App.tsx) still does
  // the real work of keeping the initial bundle small.
})
