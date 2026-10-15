import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://ud-api.mangotyping.fun',
        changeOrigin: true,
        secure: true,
        configure: proxy => {
          // Vite proxies same-origin local requests; let the API's CORS middleware
          // treat this server-to-server development request as a non-browser call.
          proxy.on('proxyReq', proxyReq => proxyReq.removeHeader('origin'));
        }
      }
    }
  },
  build: { sourcemap: false }
});
