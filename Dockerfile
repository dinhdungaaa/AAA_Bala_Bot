# Backend container cho BalaBot (bao gom Zalo group bot listener).
# Chay duoc tren bat ky host container nao: Railway, Fly.io, Koyeb, VPS (docker).
# Listener zca-js can tien trinh Node luon-bat -> dung host khong "ngu".

# Node 22+ required: @supabase/supabase-js needs native WebSocket (createClient
# throws on Node 20 without the "ws" package). Node 22 has global WebSocket.
FROM node:22-slim

WORKDIR /app

# Cai full deps (gom dev: vite/esbuild can cho buoc build)
COPY package*.json ./
RUN npm ci --include=dev

# Build frontend (vite) + bundle server (esbuild -> dist/server.cjs)
COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
# Host (Railway/Koyeb/Fly) tu gan $PORT; server doc process.env.PORT, mac dinh 3000.
EXPOSE 3000

CMD ["node", "dist/server.cjs"]
