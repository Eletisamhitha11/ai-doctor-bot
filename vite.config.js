import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy all Netlify function calls to netlify dev (port 8888)
      '/.netlify': {
        target: 'http://localhost:8888',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})