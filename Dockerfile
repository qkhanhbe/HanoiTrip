FROM node:22.23.2-alpine3.23@sha256:72c5815a06aed9a2273aea5628d74d348af57843a7b547af2fe53dd3e4b95261 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --engine-strict --registry=https://registry.npmjs.org/ --strict-ssl=true --no-audit --no-fund
COPY tsconfig*.json vite.config.ts index.html ./
COPY app ./app
COPY public ./public
RUN npm run build && npm prune --omit=dev

FROM node:22.23.2-alpine3.23@sha256:72c5815a06aed9a2273aea5628d74d348af57843a7b547af2fe53dd3e4b95261 AS runtime
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
      /usr/local/bin/npm /usr/local/bin/npx \
      /usr/local/lib/node_modules/corepack \
      /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
      /opt/yarn-v1.22.22
WORKDIR /app
ARG BUILD_SHA=local-dev
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 BUILD_SHA=${BUILD_SHA}
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["dist/server/index.js"]
