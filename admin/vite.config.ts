import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const allowedHosts = [
  'decouverte-production.up.railway.app',
  'localhost',
  '127.0.0.1',
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Admin runtime (Vite browser) should use import.meta.env only
      '@lib': path.resolve(__dirname, './src/lib'),
      // Shared types/constants (non-runtime, safe for Vite)
      '@shared': path.resolve(__dirname, '../lib'),
    },
  },
  server: { port: 3001, allowedHosts },
  preview: { allowedHosts },
})
