FROM node:20-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl openssl-dev

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including dev for build)
RUN npm install --include=dev

# Generate Prisma client BEFORE build
RUN npx prisma generate

# Copy source
COPY . .

# Re-generate after full copy (ensures schema is in sync)
RUN npx prisma generate

# TypeScript build
RUN npm run build

# Expose port
EXPOSE 3001

# Start — migrate then run
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
