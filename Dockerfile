# syntax=docker/dockerfile:1

# ---- Stage 1: build the SPA -------------------------------------------------
FROM node:22-alpine AS web

WORKDIR /build/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci

COPY web/ ./
RUN npm run build

# ---- Stage 2: server dependencies ------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /build/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev

# ---- Stage 3: runtime -------------------------------------------------------
FROM node:22-alpine AS runtime

# tini reaps zombies and forwards signals, so the container stops promptly.
RUN apk add --no-cache tini su-exec

# OCI labels: these link the published package to its repository and
# licence on GHCR, and populate the package page's description.
LABEL org.opencontainers.image.title="Timely Content" \
      org.opencontainers.image.description="Share files and markdown notes by QR code, with per-link view limits and optional self-destruct." \
      org.opencontainers.image.source="https://github.com/jgruber/timely-content" \
      org.opencontainers.image.url="https://github.com/jgruber/timely-content" \
      org.opencontainers.image.documentation="https://github.com/jgruber/timely-content#readme" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="jgruber"

ENV NODE_ENV=production \
    PORT=9080 \
    DATA_DIR=/data \
    WEB_DIST=/app/web/dist

WORKDIR /app

COPY --from=deps  /build/server/node_modules ./server/node_modules
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY --from=web   /build/web/dist ./web/dist

# The stock "node" user (uid 1000) owns the app; the data volume is chowned at
# start-up by the entrypoint so a fresh host directory works out of the box.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 9080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||9080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/src/index.js"]
