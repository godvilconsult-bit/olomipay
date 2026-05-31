FROM node:20-alpine

# Install OpenSSL + postgresql-client for Prisma
RUN apk add --no-cache openssl openssl-dev postgresql-client

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

# Start directly — tables created by dbSetup.ts on boot
CMD ["node", "dist/index.js"]
