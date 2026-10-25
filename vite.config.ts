import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the built site works at any mount point
  // (github.io/<repo>/ project pages, custom domains, file://).
  base: './',
  plugins: [react()],
  test: {
    // Exclude local recovery archives and prepared source copies.
    exclude: [...configDefaults.exclude, '.local-review/**'],
  },
})
