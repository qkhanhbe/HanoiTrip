FROM node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --engine-strict --registry=https://registry.npmjs.org/ --strict-ssl=true --no-audit --no-fund
COPY tsconfig*.json vite.config.ts index.html ./
COPY app ./app
COPY public ./public
RUN npm run build && npm prune --omit=dev

FROM debian@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a AS runtime-security
RUN apt-get -o Acquire::ForceIPv4=true update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends --only-upgrade -y libssl3t64=3.5.7-1~deb13u3 \
    && mkdir -p /patched-dpkg \
    && dpkg-query -s libssl3t64 > /patched-dpkg/libssl3t64 \
    && rm -rf /var/lib/apt/lists/*

FROM gcr.io/distroless/nodejs22-debian13@sha256:5ef534d3db0ac0c43bee379af4ae49cfbfc0ef38a46c94c52d87c68f32f34d8a AS runtime
COPY --from=runtime-security /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/libcrypto.so.3
COPY --from=runtime-security /usr/lib/x86_64-linux-gnu/libssl.so.3 /usr/lib/x86_64-linux-gnu/libssl.so.3
COPY --from=runtime-security /patched-dpkg/libssl3t64 /var/lib/dpkg/status.d/libssl3t64
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
