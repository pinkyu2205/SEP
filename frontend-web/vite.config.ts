import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      // STOMP over native WebSocket (BE WebSocketConfig, endpoint /ws). Bắt buộc
      // `ws: true` — thiếu nó thì request Upgrade dừng ở dev server, client báo
      // "connection lost" mà backend không hề thấy ai kết nối.
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
      // Goong REST (autocomplete/geocode/place detail) bị CORS khi gọi thẳng từ
      // browser → proxy qua dev server cho cùng origin. Xem goong.service.ts.
      '/goong-rest': {
        target: 'https://rsapi.goong.io',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/goong-rest/, ''),
      },
    },
  },
});
