# syntax=docker/dockerfile:1
# ═══════════════════════════════════════════════════════════════════════════
#  frontend-web (Vite + React + Tailwind) — build tĩnh rồi serve bằng Nginx.
#
#  BUILD:  docker build -t hoangbinhland-web ./frontend-web
#  RUN:    docker run -d -p 8080:80 -e BACKEND_URL=http://<host-BE>:8080 hoangbinhland-web
#          → mở http://localhost:8080  (đổi BACKEND_URL sang địa chỉ backend Spring thật)
# ═══════════════════════════════════════════════════════════════════════════

# ─── Stage 1: Build bundle tĩnh bằng Node ───────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Cài dependencies theo lockfile trước → tận dụng cache Docker khi chỉ sửa source.
COPY package.json package-lock.json ./
RUN npm ci

# Copy source & build (script "build" = tsc && vite build → ra thư mục dist/).
# Biến VITE_* trong .env được Vite nhúng vào bundle lúc build (các key này là
# client-side public nên nhúng là bình thường).
COPY . .
RUN npm run build

# ─── Stage 2: Serve dist/ bằng Nginx ────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Địa chỉ backend để Nginx proxy /api tới (thay cho proxy của Vite lúc dev).
# Mặc định 'backend:8080' (tên service khi dùng docker-compose); chạy lẻ thì override:
#   docker run -e BACKEND_URL=http://192.168.1.x:8080 ...
ENV BACKEND_URL=http://backend:8080

# Image Nginx tự envsubst mọi file /etc/nginx/templates/*.template (thay ${BACKEND_URL})
# → /etc/nginx/conf.d/default.conf khi container khởi động.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
# CMD mặc định của image nginx đã gồm bước envsubst + khởi động nginx.
