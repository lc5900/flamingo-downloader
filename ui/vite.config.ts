import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        logs: resolve(__dirname, 'logs.html'),
      },
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)([\\/]|$)/,
              priority: 30,
            },
            {
              name: 'tauri-vendor',
              test: /[\\/]node_modules[\\/]@tauri-apps[\\/]/,
              priority: 25,
            },
            {
              name: 'ant-icons-vendor',
              test: /[\\/]node_modules[\\/]@ant-design[\\/]icons-svg([\\/]|$)/,
              priority: 22,
            },
            {
              name: 'antd-vendor',
              test: /[\\/]node_modules[\\/](antd|@ant-design[\\/]|@rc-component[\\/])/,
              priority: 20,
              minSize: 100_000,
              maxSize: 700_000,
            },
          ],
        },
      },
    },
  },
})
