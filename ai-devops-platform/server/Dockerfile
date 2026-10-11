FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./

# Install dependencies including build tools
RUN npm ci

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Remove development dependencies after build
RUN npm prune --omit=dev

EXPOSE 4000

CMD ["node", "dist/server.js"]