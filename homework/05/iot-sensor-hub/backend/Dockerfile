# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 - deps: install production dependencies only.
# Build tools and the npm cache stay in this stage and never reach the
# final image.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Copy manifests first so this layer is cached until dependencies change.
# The trailing * makes package-lock.json optional so the build works on a fresh
# checkout. With a lockfile (recommended: run `npm install --package-lock-only`
# once and commit it) the build uses `npm ci` for reproducible installs.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && npm cache clean --force

# ---------------------------------------------------------------------------
# Stage 2 - runtime: minimal image that runs as an unprivileged user.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Files are owned by the built-in non-root "node" user (uid 1000).
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

USER node
EXPOSE 3000

# Exec form so Node receives SIGTERM directly (graceful shutdown).
# Compose also sets `init: true` so a tiny init process reaps zombies.
CMD ["node", "src/server.js"]
