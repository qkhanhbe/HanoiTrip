FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --engine-strict --registry=https://registry.npmjs.org/ --strict-ssl=true --no-audit --no-fund
COPY tsconfig*.json vite.config.ts index.html ./
COPY app ./app
COPY public ./public
RUN npm run build && npm prune --omit=dev

FROM gcr.io/distroless/nodejs22-debian12@sha256:8a3e96fe3345b5d83ecec2066e7c498139a02a6d1214e4f6c39f9ce359f3f5bc AS runtime
WORKDIR /app
ARG BUILD_SHA=local-dev
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 BUILD_SHA=${BUILD_SHA}
COPY --from=build --chown=65532:65532 /app/package.json /app/package-lock.json ./
COPY --from=build --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=build --chown=65532:65532 /app/dist ./dist
USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["dist/server/index.js"]
