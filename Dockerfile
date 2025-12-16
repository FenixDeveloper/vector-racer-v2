# ==========================================
# Stage 1: Build client
# ==========================================
FROM node:20-alpine AS client-builder

WORKDIR /app/client

# Copy package files
COPY client/package*.json ./

# Install dependencies
RUN npm ci --silent

# Copy source code
COPY client/ ./

# Build with configurable base path (default: /race/)
ARG VITE_BASE_PATH=/race/
ARG VITE_SERVER_URL
ENV VITE_BASE_PATH=${VITE_BASE_PATH}
ENV VITE_SERVER_URL=${VITE_SERVER_URL}

RUN npm run build

# ==========================================
# Stage 2: Build Go server
# ==========================================
FROM golang:1.21-alpine AS server-builder

WORKDIR /app/server

# Copy go mod files
COPY server/go.mod server/go.sum ./
RUN go mod download

# Copy source code
COPY server/ ./

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o gameserver ./cmd/gameserver

# ==========================================
# Stage 3: Production runtime
# ==========================================
FROM nginx:alpine

# Install supervisor to run both nginx and gameserver
RUN apk --no-cache add supervisor ca-certificates tzdata

WORKDIR /app

# Copy built client to nginx html directory
ARG BASE_PATH=/race/
COPY --from=client-builder /app/client/dist /usr/share/nginx/html${BASE_PATH}

# Copy Go binary
COPY --from=server-builder /app/server/gameserver /app/gameserver

# Copy nginx config
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Copy supervisor config
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose ports
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/race/health || exit 1

# Run supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
