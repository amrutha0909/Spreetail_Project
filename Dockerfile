FROM node:20-slim

# Install OpenSSL and CA certificates required by Prisma engines and secure DB connections
RUN apt-get update -y && apt-get install -y openssl ca-certificates

WORKDIR /app

# Copy backend package files and install dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# Copy backend source code
COPY backend/ ./backend/

# Copy frontend package files and install dependencies
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

# Copy frontend source code
COPY frontend/ ./frontend/

# Build frontend (Vite config builds directly into backend/public)
RUN cd frontend && npm run build

# Generate Prisma client
RUN cd backend && npx prisma generate

WORKDIR /app/backend

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]