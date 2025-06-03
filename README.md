# Gluetun Health Check Monitor

A Bun application that monitors Docker containers attached to Gluetun VPN containers and automatically redeploys them when they become unhealthy.

## 🚀 **Zero Configuration Required**

**This application works out-of-the-box with full auto-discovery!** Simply run it and it will:
- 🔍 **Auto-detect** Gluetun containers using multiple detection methods
- 🔗 **Auto-discover** containers attached to Gluetun networks
- 🏥 **Auto-monitor** their health status
- 🔄 **Auto-redeploy** unhealthy containers using their existing Docker Compose configuration

No manual configuration or container listing required - just start the monitor and it handles everything automatically!

## Quick Start

### Using Pre-built Image (Recommended)

**Basic usage - works immediately:**
```bash
# Simple and effective - works immediately
docker run -d \
  --name gluetun-health-check \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/visualies/gluetun-health-check:latest
```

### Using Docker Compose

```yaml
version: '3.8'
services:
  gluetun-health-check:
    image: ghcr.io/visualies/gluetun-health-check:latest
    container_name: gluetun-health-check
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    # Optional: Override defaults
    environment:
      - CHECK_INTERVAL=30000  # 30 seconds
      - DRY_RUN=false
```

## Features

- 🔍 **Auto-discovery**: Automatically detects Gluetun containers by image name pattern
- 🔗 **Network Detection**: Finds containers using `container:` network mode attached to Gluetun
- 🏥 **Health Monitoring**: Monitors container health status and running state
- 🔄 **Auto-redeployment**: Automatically redeploys unhealthy containers using Docker Compose
- 📊 **Smart Compose Detection**: Extracts compose project and file information from container labels
- ⚙️ **Configurable**: Environment variable based configuration
- 🧪 **Dry Run Mode**: Test mode to see what would be redeployed without actually doing it

## How It Works

1. **Discovery**: Scans all Docker containers to find Gluetun instances (by image pattern)
2. **Attachment Detection**: Identifies containers using `NetworkMode: "container:GLUETUN_ID"`
3. **Health Check**: Monitors the health status of attached containers
4. **Container Recreation**: When unhealthy, stops, removes, and recreates containers with the same configuration

## Redeployment Process

When an unhealthy container is detected, the application:

1. **Stops** the unhealthy container
2. **Removes** the container completely
3. **Recreates** it with the exact same configuration (image, environment, network settings, etc.)
4. **Starts** the new container

This approach:
- ✅ **Works through Docker socket only** - no compose files needed
- ✅ **Preserves all configuration** - same image, env vars, network mode, etc.
- ✅ **Fast and reliable** - typically completes in 10-30 seconds
- ✅ **Handles most issues** - network problems, process crashes, corrupted state

## Usage

### Using Pre-built Image

The easiest way to use this application is with the pre-built Docker image from GitHub Container Registry:

```bash
# Basic usage
docker run -d \
  --name gluetun-health-check \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/visualies/gluetun-health-check:latest

# With custom configuration
docker run -d \
  --name gluetun-health-check \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e CHECK_INTERVAL=60000 \
  -e DRY_RUN=true \
  ghcr.io/visualies/gluetun-health-check:latest
```

### Development

```bash
# Install dependencies
bun install

# Run in development mode (with hot reload)
bun run dev

# Run in production mode
bun run start
```

### Building from Source

```bash
# Clone the repository
git clone https://github.com/visualies/gluetun-health-check.git
cd gluetun-health-check

# Build the Docker image
docker build -t gluetun-health-check .

# Run the locally built image
docker run -d \
  --name gluetun-health-check \
  -v /var/run/docker.sock:/var/run/docker.sock \
  gluetun-health-check
```

## Advanced Gluetun Detection

The application uses **multiple robust detection methods** to find Gluetun containers:

1. **Image Pattern Matching**: Checks if image name contains "gluetun" (configurable)
2. **Container Labels**: Looks for:
   - `app=gluetun`
   - `image=*gluetun*` 
   - `gluetun.enabled=true`
3. **Container Name**: Checks if container name contains "gluetun"
4. **Future-ready**: Extensible for environment variable/port detection

This multi-method approach ensures reliable detection regardless of how your Gluetun containers are configured.

## How Containers Are Detected

The application looks for containers with:

1. **Network Mode**: `container:GLUETUN_CONTAINER_ID`
2. **Gluetun Container**: Must match one of the detection methods above

## What Gets Preserved vs Recreated

When recreating an unhealthy container, the application:

**✅ Preserves:**
- Image and tag
- Environment variables  
- Volume mounts
- Labels
- Port mappings
- User settings

**🔄 Recreates Fresh:**
- **Network configuration** - Updates to point to current running Gluetun container
- Container ID and name
- Process state

**Why this matters:** When Gluetun restarts, attached containers become unhealthy because they're still pointing to the old Gluetun container ID. Recreation updates the network mode to point to the current running Gluetun container, allowing proper reattachment.

## Container Health Detection

A container is considered unhealthy if:

1. **Not Running**: Container state is not "running"
2. **Health Check Failed**: Container has a health check that reports "unhealthy" for consecutive failures >= threshold
3. **No Health Check**: Containers without health checks are considered healthy if they're running

## Requirements

- Docker socket access (`/var/run/docker.sock`)
- Appropriate permissions to access Docker API

The application handles everything else automatically through the Docker API.

## Logging

The application provides detailed logging with emojis for easy identification:

- 🚀 Application start
- 🏥 Health check start
- 📋 Container discovery
- 🔌 Gluetun detection
- 🔗 Attached container detection
- ✅ Healthy status
- 🚨 Unhealthy detection
- 🔄 Redeployment process
- ❌ Errors

## Security Considerations

- The application requires access to the Docker socket
- It can execute Docker Compose commands, which means it has significant system access
- Run with appropriate security constraints in production
- Consider using Docker socket proxy for additional security

## Troubleshooting

### Docker Socket Connection Issues

The application **automatically handles Docker socket permissions** with no configuration required!

**Standard Usage:**
```bash
docker run -d \
  --name gluetun-health-check \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/visualies/gluetun-health-check:latest
```

The smart entrypoint automatically detects and configures Docker socket permissions securely.

### No Gluetun containers found
- Check that your Gluetun containers are running
- Verify the `GLUETUN_IMAGE_PATTERN` matches your Gluetun image name
- Check container images with: `docker ps --format "table {{.Names}}\t{{.Image}}"`

### Containers not being detected as attached
- Verify containers are using `network_mode: "container:gluetun-container-name"`
- Check network mode with: `docker inspect CONTAINER_NAME | grep NetworkMode`

### Redeployment failing
- Ensure Docker Compose files exist at the expected paths
- Check that the application has permission to execute Docker commands
- Verify compose project labels are correctly set

### Enable dry run mode
Set `DRY_RUN=true` to see what commands would be executed without actually running them.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `bun run test`
5. Submit a pull request

## License

MIT License - see LICENSE file for details. 