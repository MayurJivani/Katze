# Katze, as one container: the relay serves the built site and the WebSocket on
# a single port, so the reverse proxy in front needs one rule.
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first, so this layer only rebuilds when the lockfile moves.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
# Only the server workspace: React, three and Vite are build-time here, and the
# runtime needs express and ws and nothing else.
RUN npm ci --omit=dev --workspace apps/server --include-workspace-root \
  && npm cache clean --force

COPY apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 4331
CMD ["node", "apps/server/src/index.js"]
