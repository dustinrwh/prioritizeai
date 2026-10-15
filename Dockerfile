# syntax=docker/dockerfile:1
FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-slim AS deps
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
# Production dependencies of the server only (the shared package is bundled into dist by tsup).
RUN pnpm install --frozen-lockfile --prod --filter @prioritize/server...

FROM node:20-slim
ENV NODE_ENV=production PORT=8080 WEB_DIST=/app/web/dist MIGRATIONS_DIR=/app/server/migrations
# Keep the pnpm workspace layout so the symlinked node_modules resolve.
WORKDIR /app/server
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/migrations ./migrations
COPY --from=build /app/web/dist /app/web/dist
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
