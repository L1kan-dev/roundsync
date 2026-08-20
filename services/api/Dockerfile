# Use official Node.js 22 slim image
FROM node:22-slim

WORKDIR /app

# Copy package definition and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy API gateway source code
COPY . .

# Expose API port
EXPOSE 3001

# Start Express server
CMD ["node", "server.js"]
    