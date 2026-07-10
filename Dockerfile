FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=8097
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_DISABLE_SANDBOX=1
ENV TAVOLAMICA_CACHE_DIR=/app/data/cache

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
RUN mkdir -p /app/data/cache && chown -R node:node /app/data

EXPOSE 8097
USER node
CMD ["node", "src/server.js"]
