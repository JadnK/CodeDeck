# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    CODEDECK_WEB_HOST=0.0.0.0 \
    CODEDECK_WEB_PORT=8080 \
    CODEDECK_PROJECTS_ROOT=/projects \
    CODEDECK_DATA_DIR=/data \
    CODEDECK_WEB_ROOT=/app/public \
    HOME=/tmp/codedeck-home

RUN corepack enable \
    && corepack prepare pnpm@10.33.0 yarn@1.22.22 --activate \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       bash ca-certificates git openssh-client tini python3 python3-pip build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/server /app/public /data /projects /tmp/codedeck-home \
    && chown -R node:node /app /data /projects /tmp/codedeck-home

WORKDIR /app
COPY --chown=node:node hosted/server ./server
COPY --chown=node:node hosted/public ./public

USER node
EXPOSE 8080
VOLUME ["/data", "/projects"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.mjs"]
