FROM node:20-alpine

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

EXPOSE 3001

# Run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
