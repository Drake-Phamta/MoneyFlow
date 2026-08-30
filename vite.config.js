import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    fs: { strict: true },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        /**
         * Tách ba thư viện nặng ra khỏi gói chính.
         *
         * Trước đây tất cả nằm trong một tệp 1,05MB, nên mở app là tải cả thư
         * viện biểu đồ và thư viện đọc Excel — kể cả khi chỉ xem Tổng quan.
         * Tách ra thì trình duyệt lưu đệm riêng từng phần, và bản vá sau chỉ
         * làm hết hạn đúng phần đã đổi.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('recharts') || id.includes('d3-')) return 'charts';
          if (id.includes('xlsx')) return 'excel';
          if (id.includes('phosphor')) return 'icons';
          if (id.includes('react-dom') || id.includes('react-router')) return 'react';
        },
      },
    },
  },
});
