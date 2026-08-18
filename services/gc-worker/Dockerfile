# Use official Node.js 20 slim image
FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy worker application code
COPY . .

# Start GC Worker process
CMD ["node", "index.js"]
