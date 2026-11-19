# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN DATABASE_URL="mysql://build:build@localhost:3306/build" \
    npx prisma generate --config prisma7.config.ts

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json prisma7.config.ts ./
COPY --chown=node:node prisma ./prisma

RUN mkdir -p /app/uploads/rooms && chown -R node:node /app/uploads

USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma migrate deploy --config prisma7.config.ts && if [ \"$RUN_SEED\" = \"true\" ]; then node dist/database/seed.js; fi && exec node dist/main.js"]
