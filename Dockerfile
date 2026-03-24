FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/mcp-protocol/package.json packages/mcp-protocol/
COPY packages/crypto/package.json packages/crypto/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY packages/crypto packages/crypto
COPY packages/mcp-protocol packages/mcp-protocol
RUN pnpm --filter @authbox/shared build && pnpm --filter @authbox/mcp-protocol build

FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/shared/package.json /app/packages/shared/dist packages/shared/
COPY --from=build /app/packages/crypto/package.json packages/crypto/
COPY --from=build /app/packages/mcp-protocol/package.json /app/packages/mcp-protocol/dist packages/mcp-protocol/
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=build /app/packages/mcp-protocol/node_modules packages/mcp-protocol/node_modules
ENTRYPOINT ["node", "packages/mcp-protocol/dist/stdio-server.js"]
