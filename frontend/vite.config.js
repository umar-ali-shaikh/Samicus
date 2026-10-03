import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // A stray NODE_ENV=development in the shell must never ship React's development build.
  if (command === 'build') process.env.NODE_ENV = 'production'
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      // In development the API runs separately on :4000; proxying keeps the browser same-origin.
      proxy: { '/api': { target: env.VITE_DEV_API_TARGET || 'http://localhost:4000', changeOrigin: true } },
    },
  }
})
