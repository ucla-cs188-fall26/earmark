/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `base` must match the GitHub Pages path (https://<org>.github.io/earmark/).
// Local dev ignores it.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES ? '/earmark/' : '/',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
