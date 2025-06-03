# Build stage - dependencies only
FROM oven/bun:1-slim AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Build stage - copy source
FROM deps AS builder
COPY src ./src

# Runtime stage  
FROM oven/bun:1-slim
WORKDIR /app

# Copy app from builder
COPY --from=builder /app ./

# Install Docker CLI and docker-compose in single layer
USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        docker.io \
        curl \
        ca-certificates && \
    curl -L "https://github.com/docker/compose/releases/download/v2.24.1/docker-compose-linux-$(uname -m)" -o /usr/local/bin/docker-compose && \
    chmod +x /usr/local/bin/docker-compose && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean

# Create optimized entrypoint
COPY <<EOF /entrypoint.sh
#!/bin/bash
set -e

if [ -S /var/run/docker.sock ]; then
    DOCKER_SOCKET_GID=\$(stat -c '%g' /var/run/docker.sock)
    EXISTING_GROUP=\$(getent group \$DOCKER_SOCKET_GID | cut -d: -f1)
    
    if [ -n "\$EXISTING_GROUP" ]; then
        usermod -aG \$EXISTING_GROUP bun
    else
        if getent group docker > /dev/null 2>&1; then
            groupadd -g \$DOCKER_SOCKET_GID dockersock
            usermod -aG dockersock bun
        else
            groupadd -g \$DOCKER_SOCKET_GID docker
            usermod -aG docker bun
        fi
    fi
    
    if su bun -c "test -r /var/run/docker.sock -a -w /var/run/docker.sock"; then
        exec su bun -c "cd /app && bun run src/index.ts"
    else
        exec bun run src/index.ts
    fi
else
    echo "❌ Docker socket not found"
    exit 1
fi
EOF

RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENTRYPOINT ["/entrypoint.sh"] 