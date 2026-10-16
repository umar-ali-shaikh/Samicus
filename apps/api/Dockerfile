# Build context is the repo root (npm workspaces need the root lockfile + every workspace's
# package.json before `npm ci` can resolve the tree) -- build with:
#   docker build -f apps/api/Dockerfile -t vidhira-api .
# apps/api runs via tsx (see package.json's "start" script) rather than a tsc/tsup build --
# there is no separate compile step for this app yet (a known gap, not introduced here).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY frontend/package.json frontend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm ci

FROM deps AS build
COPY packages/contracts packages/contracts
COPY packages/config packages/config
COPY apps/api apps/api
RUN npm run build -w @vidhira/contracts

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
EXPOSE 4000
USER node
CMD ["npm", "run", "start", "-w", "@vidhira/api"]
