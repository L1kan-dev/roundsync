# Use official Node.js 22 slim image
FROM node:22-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy worker application code
COPY . .

# Start GC Worker process
CMD ["node", "index.js"]
    