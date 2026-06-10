FROM node:20-alpine

# Cache bust — increment to force full rebuild
ARG CACHE_BUST=10

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl openssl-dev

WORKDIR /app

# Copy package files and schema first
COPY package*.json ./
COPY prisma ./prisma/

# Install all deps (including dev for build)
RUN npm install --include=dev

# Generate Prisma client
RUN npx prisma generate

# Copy source and build
COPY . .
RUN npx prisma generate
RUN npm run build

# Slim the runtime image: drop dev deps (tsx, typescript, @types, embedded-postgres)
# but keep prisma + @prisma/client so start.sh can run `prisma db push`.
RUN npm prune --omit=dev

# Make startup script executable
RUN chmod +x start.sh

EXPOSE 3001

# Run prisma db push then start — creates all tables + enums correctly
CMD ["sh", "start.sh"]
