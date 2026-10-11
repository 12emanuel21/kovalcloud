# Multi-stage. Por defecto (último stage) se construye PRODUCCIÓN.
# Desarrollo con hot-reload: docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---------- dev: ts-node-dev con hot-reload ----------
FROM deps AS dev
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]

# ---------- build: compila a dist/ y quita devDependencies ----------
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- prod (por defecto) ----------
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# La sesión de WhatsApp vive en un volumen montado aquí
RUN mkdir -p auth_info_baileys && chown -R node:node /app
USER node
EXPOSE 5000
CMD ["npm", "start"]
