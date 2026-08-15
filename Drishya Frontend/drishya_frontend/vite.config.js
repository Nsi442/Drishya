import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward API calls to the Spring Boot backend so the browser only ever
      // talks to one origin. This sidesteps CORS entirely in development — the
      // backend also sets CORS headers, but with the proxy they are not needed.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
