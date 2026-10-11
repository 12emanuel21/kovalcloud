# Multi-stage. Por defecto (último stage) se construye PRODUCCIÓN: next build + next start.
# Desarrollo con hot-reload: docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---------- dev: next dev con hot-reload (el código llega por bind mount) ----------
FROM deps AS dev
COPY . .
EXPOSE 3030
CMD ["npm", "run", "dev"]

# ---------- build: compila la app y quita devDependencies ----------
FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- prod (por defecto) ----------
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production     NEXT_TELEMETRY_DISABLED=1     PORT=3030     HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/next.config.ts ./
USER node
EXPOSE 3030
CMD ["npm", "start", "--", "-p", "3030"]
