import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = process.env.API_PORT || process.env.PORT || env.API_PORT || env.PORT || '3001'
  return {
  plugins: [vue(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/vue')) return 'vue'
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': `http://localhost:${apiPort}`
    }
  }
  }
})
