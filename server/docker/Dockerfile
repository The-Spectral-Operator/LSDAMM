# LSDAMM Coordination Server Dockerfile
# Multi-stage build for production

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY server/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY server/ ./

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache tini

# Create non-root user
RUN addgroup -g 1001 -S meshcoord && \
    adduser -S meshcoord -u 1001 -G meshcoord

# Copy built files
COPY --from=builder --chown=meshcoord:meshcoord /app/dist ./dist
COPY --from=builder --chown=meshcoord:meshcoord /app/node_modules ./node_modules
COPY --from=builder --chown=meshcoord:meshcoord /app/package.json ./

# Create data directories
RUN mkdir -p /app/data /app/logs /app/config && \
    chown -R meshcoord:meshcoord /app/data /app/logs /app/config

# Copy default config
COPY --chown=meshcoord:meshcoord server/config/server.example.toml /app/config/server.toml

# Switch to non-root user
USER meshcoord

# Environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/app/data/mesh.db \
    LOG_PATH=/app/logs \
    CONFIG_PATH=/app/config/server.toml

# Expose ports
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Use tini as init
ENTRYPOINT ["/sbin/tini", "--"]

# Start server
CMD ["node", "dist/main.js"]
