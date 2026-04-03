import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        logs: resolve(__dirname, 'logs.html'),
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'react-vendor'
          if (id.includes('/@ant-design/icons/')) return 'antd-icons-vendor'
          if (id.includes('/@rc-component/') || id.includes('/rc-')) return 'rc-vendor'
          if (id.includes('/@emotion/')) return 'emotion-vendor'
          if (id.includes('/antd/') || id.includes('/@ant-design/')) return 'antd-vendor'
          if (id.includes('/@tauri-apps/')) return 'tauri-vendor'
        },
      },
    },
  },
})
