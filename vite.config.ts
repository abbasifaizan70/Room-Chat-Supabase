import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
// Set VITE_BASE_PATH=/your-repo-name/ when deploying to GitHub Pages (project site).
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  // Always load `.env` next to this file (fixes missing VITE_* when cwd is not the repo root).
  envDir: projectRoot,
  plugins: [react()],
})
