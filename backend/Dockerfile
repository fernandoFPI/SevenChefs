FROM node:20-alpine

# Install postgresql-client for pg_dump (backup feature)
RUN apk add --no-cache postgresql-client

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Create backups directory
RUN mkdir -p /app/backups

EXPOSE 3000

CMD ["node", "server.js"]
