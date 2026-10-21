# Frontend Dockerfile for ChangeLens

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY src ./src
COPY public ./public
COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./

# Vite inlines import.meta.env at BUILD time, so the API address must be a build argument; setting it
# as a runtime environment variable on the nginx container (as compose used to) has no effect.
# The default (empty) keeps the relative URL /api, which nginx proxies to the backend -- same origin,
# no CORS. Only set this to reach an API on a different origin:
#   docker compose build --build-arg VITE_API_BASE_URL=https://api.example.com/api frontend
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build production bundle
RUN npm run build

# Production image - serve with nginx
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
