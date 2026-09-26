# Multi-stage production Dockerfile for KOSMO Backend
# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/

# Install full dependencies including devDependencies for build
RUN npm ci

# Copy backend source code and config
COPY tsconfig.json ./
COPY backend/ ./backend/

# Compile TypeScript and generate esbuild production bundle in api/index.js
RUN npm run build:backend

# Stage 2: Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy package manifests and install only production dependencies
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled backend bundle from builder
COPY --from=builder /app/api ./api
COPY --from=builder /app/backend ./backend

# Create uploads directory and set permissions for non-root node user
RUN mkdir -p /app/backend/uploads && chown -R node:node /app

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["node", "api/index.js"]
