import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// In dev, /api is proxied to the Fastify backend. In production, serve the SPA and the API under the same origin (or set CORS_ORIGINS).
export default defineConfig({ plugins: [react()], server: { proxy: { '/api': 'http://localhost:3001' } }, test: { environment: 'node', include: ['test/**/*.test.ts'] } })
