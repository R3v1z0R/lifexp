FROM node:24-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy monorepo config files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./

# Copy packages and API
COPY packages ./packages
COPY apps/api ./apps/api

# Install dependencies (set CI=true to avoid TTY issues in Docker)
RUN CI=true pnpm install --frozen-lockfile

# Build packages
RUN pnpm build

# Expose port
EXPOSE 3000

# Default command - start with tsx (hot reload compatible)
CMD ["sh", "-c", "cd /app/apps/api && pnpm dev"]
