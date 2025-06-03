FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Copy package files
COPY package.json ./
COPY bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src ./src

# Install Docker CLI for container redeployment
USER root
RUN apt-get update && apt-get install -y docker.io && rm -rf /var/lib/apt/lists/*

# Switch back to bun user for security
USER bun

# Expose port (optional, for health checks)
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Run the application
ENTRYPOINT ["bun", "run", "src/index.ts"] 