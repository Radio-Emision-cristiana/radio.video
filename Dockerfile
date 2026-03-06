# Use Node.js 18 LTS for better performance
FROM node:18-bullseye

# Install required packages
RUN apt-get update && apt-get install -y \
    ffmpeg \
    dos2unix \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY server.js ./
COPY start.sh ./
COPY public ./public

# Make start script executable
RUN chmod +x start.sh

# Create necessary directories
RUN mkdir -p public/hls

# Set environment variables for better performance
ENV NODE_ENV=production
ENV PORT=3000
ENV UV_THREADPOOL_SIZE=16

# Expose port (Render will override this if needed)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD sh -c "./start.sh & node server.js"
