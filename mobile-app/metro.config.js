// Metro config cho Expo.
// Mục đích chính: thêm DEV PROXY cho web — chuyển tiếp mọi request /api/* từ
// dev server (localhost:8081) sang backend Spring (localhost:8080).
// Nhờ vậy app web gọi cùng origin -> không dính CORS, KHÔNG cần sửa backend.
// (Trên mobile native không qua proxy này; xem src/services/core/realApiClient.ts.)
const { getDefaultConfig } = require('expo/metro-config');
const http = require('http');

const config = getDefaultConfig(__dirname);

// Backend Spring thật. Đổi nếu BE chạy ở host/cổng khác.
const BACKEND_HOST = 'localhost';
const BACKEND_PORT = 8080;

config.server = config.server || {};
const prevEnhance = config.server.enhanceMiddleware;

config.server.enhanceMiddleware = (middleware, server) => {
  const base = prevEnhance ? prevEnhance(middleware, server) : middleware;
  return (req, res, next) => {
    if (req.url && req.url.startsWith('/api/')) {
      const proxyReq = http.request(
        {
          hostname: BACKEND_HOST,
          port: BACKEND_PORT,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );
      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Dev proxy error: ' + err.message }));
      });
      req.pipe(proxyReq);
      return;
    }
    return base(req, res, next);
  };
};

module.exports = config;
