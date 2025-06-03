# Gluetun Health Check Monitor

A specialized monitoring application that ensures Docker containers attached to Gluetun VPN containers maintain proper network connectivity. Automatically detects and fixes two critical scenarios that break VPN network connections.

## 🎯 **Two Core Features**

**This application solves exactly two problems:**

### 1. 🔍 **Orphan Detection** 
When Gluetun containers are **recreated** (new container ID), attached containers become orphaned and lose all network connectivity.

### 2. 🔄 **Broken Network Detection**
When Gluetun containers **restart** (same container ID), attached containers keep running but lose network connectivity.

**Zero configuration required** - automatically detects and fixes both scenarios!

## 🚀 **How It Works**

**Orphan Detection:**
- Detects containers pointing to dead/non-existent Gluetun container IDs
- Automatically reattaches them to current running Gluetun containers
- Recreates containers with updated network configuration

**Broken Network Detection:**  
- Compares container start times to detect when Gluetun restarted after attached containers
- Identifies broken network connections even when container IDs match
- Recreates affected containers to reestablish network connectivity

## Quick Start

**Basic usage - works immediately:**
```bash
docker run -d \
  --name gluetun-health-check \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/visualies/gluetun-health-check:latest
```

## Features

- 🔍 **Auto-discovery**: Automatically detects Gluetun containers by image name pattern
- 🔗 **Network Detection**: Finds containers using `container:` network mode attached to Gluetun
- 🚨 **Orphan Detection**: Detects containers pointing to dead Gluetun instances (Feature 1)
- 🔄 **Broken Network Detection**: Detects when Gluetun restarts break network connections (Feature 2)
- 🛠️ **Automatic Recreation**: Recreates containers with proper VPN network configuration
- ⚙️ **Configurable**: Environment variable based configuration
- 🧪 **Dry Run Mode**: Test mode to see what would be recreated without actually doing it

## Container Recreation Process

When an orphaned or network-broken container is detected, the application:

1. **Stops** the problematic container
2. **Removes** the container completely  
3. **Recreates** it with identical configuration + updated network mode
4. **Starts** the new container with proper VPN connectivity

This approach:
- ✅ **Preserves all settings** - environment variables, volumes, labels, healthchecks, etc.
- ✅ **Updates network configuration** - points to current running Gluetun container
- ✅ **Fast and reliable** - typically completes in 10-30 seconds
- ✅ **Handles both scenarios** - orphaned containers and broken network connections

## How It Works

1. **Discovery**: Scans all Docker containers to find Gluetun instances (by image pattern)
2. **Attachment Detection**: Identifies containers using `NetworkMode: "container:GLUETUN_ID"`
3. **Health Check**: Monitors the health status of attached containers
4. **Container Recreation**: When unhealthy, stops, removes, and recreates containers with the same configuration

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