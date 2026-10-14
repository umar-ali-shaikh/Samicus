# Build context is the repo root (npm workspaces). Build with:
#   docker build -f apps/worker/Dockerfile -t vidhira-worker .

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY frontend/package.json frontend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm ci

FROM deps AS build
COPY packages/contracts packages/contracts
COPY packages/config packages/config
COPY apps/worker apps/worker
RUN npm run build -w @vidhira/contracts && npm run build -w @vidhira/worker

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
USER node
CMD ["npm", "run", "start", "-w", "@vidhira/worker"]
