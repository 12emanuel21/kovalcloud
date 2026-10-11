# Multi-stage. Por defecto (último stage) se construye PRODUCCIÓN.
# Desarrollo con hot-reload: docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# ---------- base: runtime común ----------
FROM node:20-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# ---------- deps: dependencias completas (toolchain para compilar bcrypt) ----------
FROM base AS deps
RUN apt-get update -y && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

# ---------- dev: hot-reload (el código llega por bind mount) ----------
FROM deps AS dev
COPY . .
EXPOSE 4000
CMD ["npm", "run", "start:dev"]

# ---------- build: compila TypeScript a dist/ y quita devDependencies ----------
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- prod (por defecto) ----------
FROM base AS prod
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
RUN mkdir -p uploads/menus && chown -R node:node /app
USER node
EXPOSE 4000
CMD ["npm", "run", "start:prod"]
