import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Forward API calls to the Spring Boot backend so the browser only ever talks
// to one origin. This sidesteps CORS entirely in development — the backend also
// sets CORS headers, but with the proxy they are not needed.
const apiProxy = {
  '/api': {
    target: 'http://localhost:8080',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy: apiProxy },

  // `preview` does NOT inherit `server`, so without this the production build
  // cannot reach the API at all and every page loads empty — which reads as an
  // application fault rather than a missing proxy line. It matters because
  // `preview` is the only way to see the build the deploy actually ships:
  // `dev` runs React in StrictMode, which double-invokes every effect and so
  // doubles the requests any measurement here would count.
  preview: { proxy: apiProxy },
})
