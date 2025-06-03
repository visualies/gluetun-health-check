FROM oven/bun:1

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY src ./src

# Install Docker CLI and create smart entrypoint
USER root
RUN apt-get update && apt-get install -y docker.io && rm -rf /var/lib/apt/lists/*

# Smart entrypoint for Docker socket permissions
COPY <<EOF /entrypoint.sh
#!/bin/bash
set -e

if [ -S /var/run/docker.sock ]; then
    DOCKER_SOCKET_GID=\$(stat -c '%g' /var/run/docker.sock)
    
    # Check if a group with this GID already exists
    EXISTING_GROUP=\$(getent group \$DOCKER_SOCKET_GID | cut -d: -f1)
    
    if [ -n "\$EXISTING_GROUP" ]; then
        # Group with this GID exists, use it
        usermod -aG \$EXISTING_GROUP bun
    else
        # No group with this GID exists, create one
        # Check if 'docker' group name is free
        if getent group docker > /dev/null 2>&1; then
            # Docker group exists with different GID, create with different name
            groupadd -g \$DOCKER_SOCKET_GID dockersock
            usermod -aG dockersock bun
        else
            # Docker group doesn't exist, create it
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