import Docker from 'dockerode';
import type { ContainerInfo, GluetunContainer, AttachedContainer, HealthCheckConfig } from './types.js';

export class DockerClient {
  private docker: Docker;
  private config: HealthCheckConfig;

  constructor(config: HealthCheckConfig) {
    this.docker = new Docker({ 
      socketPath: '/var/run/docker.sock'
    });
    this.config = config;
  }

  async getAllContainers(): Promise<ContainerInfo[]> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      
      const containerInfos: ContainerInfo[] = [];
      
      for (const containerData of containers) {
        const container = this.docker.getContainer(containerData.Id);
        const inspectData = await container.inspect();
        
        const containerInfo: ContainerInfo = {
          id: containerData.Id,
          name: containerData.Names[0]?.replace(/^\//, '') || '',
          image: containerData.Image,
          state: containerData.State,
          networkMode: inspectData.HostConfig.NetworkMode || '',
          labels: inspectData.Config.Labels || {},
        };

        // Check if container has health check
        if (inspectData.State.Health) {
          containerInfo.health = {
            status: inspectData.State.Health.Status,
            failingStreak: inspectData.State.Health.FailingStreak,
            log: (inspectData.State.Health.Log || []).map(entry => ({
              start: entry.Start,
              end: entry.End,
              exitCode: entry.ExitCode,
              output: entry.Output,
            })),
          };
        }

        containerInfos.push(containerInfo);
      }
      
      return containerInfos;
    } catch (error) {
      console.error('❌ Error fetching containers:', error);
      throw error;
    }
  }

  async findGluetunContainers(containers: ContainerInfo[]): Promise<GluetunContainer[]> {
    const gluetunContainers: GluetunContainer[] = [];
    
    for (const container of containers) {
      let isGluetun = false;
      
      // Method 1: Check if the image matches the Gluetun pattern
      if (container.image.toLowerCase().includes(this.config.gluetunImagePattern.toLowerCase())) {
        isGluetun = true;
      }
      
      // Method 2: Check container labels for Gluetun indicators
      if (container.labels) {
        // Check for specific labels that might indicate Gluetun
        const appLabel = container.labels['app']?.toLowerCase();
        const imageLabel = container.labels['image']?.toLowerCase();
        
        if (appLabel === 'gluetun' || 
            imageLabel?.includes('gluetun') || 
            container.labels['gluetun.enabled'] === 'true') {
          isGluetun = true;
        }
      }
      
      // Method 3: Check container name for gluetun pattern
      if (container.name.toLowerCase().includes('gluetun')) {
        isGluetun = true;
      }
      
      // Method 4: Check for common Gluetun environment variables or ports
      // This would require inspecting the container more deeply, but for now we'll skip
      
      if (isGluetun) {
        console.log(`🔍 Detected Gluetun container: ${container.name} (${container.image})`);
        gluetunContainers.push({
          id: container.id,
          name: container.name,
          image: container.image,
        });
      }
    }
    
    return gluetunContainers;
  }

  async findAttachedContainers(
    containers: ContainerInfo[],
    gluetunContainers: GluetunContainer[]
  ): Promise<AttachedContainer[]> {
    const attachedContainers: AttachedContainer[] = [];
    
    // Create a map of all existing container IDs for quick lookup
    const existingContainerIds = new Set(containers.map(c => c.id));
    
    for (const container of containers) {
      // Skip if this is a Gluetun container itself
      if (gluetunContainers.some(g => g.id === container.id)) {
        continue;
      }
      
      // Check if network mode is "container:X" where X is a Gluetun container
      if (container.networkMode.startsWith('container:')) {
        const targetContainerId = container.networkMode.replace('container:', '');
        
        // Method 1: Check if pointing to current Gluetun containers
        const currentGluetunContainer = gluetunContainers.find(g => 
          g.id === targetContainerId || g.id.startsWith(targetContainerId)
        );
        
        if (currentGluetunContainer) {
          const attachedContainer: AttachedContainer = {
            ...container,
            gluetunContainer: currentGluetunContainer,
          };
          
          attachedContainers.push(attachedContainer);
        } else {
          // Method 2: Check if pointing to a non-existent container (orphaned)
          const targetContainerExists = existingContainerIds.has(targetContainerId) || 
            containers.some(c => c.id.startsWith(targetContainerId));
          
          if (!targetContainerExists) {
            console.log(`🔍 Found orphaned container: ${container.name} -> dead container ${targetContainerId.substring(0, 12)}...`);
            
            // Try to find a suitable current Gluetun container to attach to
            // Use the first available Gluetun container as the target
            if (gluetunContainers.length > 0) {
              const targetGluetunContainer = gluetunContainers[0];
              console.log(`🎯 Will reattach ${container.name} to current Gluetun: ${targetGluetunContainer.name}`);
              
              const orphanedContainer: AttachedContainer = {
                ...container,
                gluetunContainer: targetGluetunContainer,
              };
              
              attachedContainers.push(orphanedContainer);
            }
          }
        }
      }
    }
    
    return attachedContainers;
  }

  isContainerUnhealthy(container: AttachedContainer): boolean {
    // If container is not running, consider it unhealthy
    if (container.state !== 'running') {
      return true;
    }
    
    // Check if container is pointing to a dead network target (orphaned)
    // This happens when Gluetun restarts and gets a new container ID
    const currentNetworkTarget = container.networkMode.replace('container:', '');
    const isPointingToCurrentGluetun = container.gluetunContainer.id === currentNetworkTarget || 
                                      container.gluetunContainer.id.startsWith(currentNetworkTarget);
    
    if (!isPointingToCurrentGluetun) {
      console.log(`🚨 Container ${container.name} is orphaned (pointing to dead network target)`);
      return true;
    }
    
    // Only check traditional health checks if enabled
    if (this.config.enableHealthChecks && container.health) {
      return container.health.status === 'unhealthy' && 
             container.health.failingStreak >= this.config.unhealthyThreshold;
    }
    
    // If no health check is enabled or defined, assume it's healthy if running and not orphaned
    return false;
  }

  async redeployContainer(container: AttachedContainer): Promise<void> {
    console.log(`🔄 Recreating container: ${container.name}`);
    
    try {
      const dockerContainer = this.docker.getContainer(container.id);
      const containerInfo = await dockerContainer.inspect();
      
      if (this.config.dryRun) {
        console.log(`🔍 DRY RUN: Would recreate container: ${container.name}`);
        return;
      }
      
      console.log(`🛑 Stopping container: ${container.name}`);
      await dockerContainer.stop();
      
      console.log(`🗑️ Removing container: ${container.name}`);
      await dockerContainer.remove();
      
      // Update network mode to point to current Gluetun container
      const updatedHostConfig = {
        ...containerInfo.HostConfig,
        NetworkMode: `container:${container.gluetunContainer.id}`
      };
      
      // Remove port bindings when using container network mode
      if (updatedHostConfig.NetworkMode.startsWith('container:')) {
        delete updatedHostConfig.PortBindings;
      }
      
      // Create a new container with updated configuration
      const createOptions = {
        Image: containerInfo.Config.Image,
        Cmd: containerInfo.Config.Cmd,
        Env: containerInfo.Config.Env,
        // Remove ExposedPorts when using container network mode
        ExposedPorts: updatedHostConfig.NetworkMode.startsWith('container:') ? undefined : containerInfo.Config.ExposedPorts,
        Labels: containerInfo.Config.Labels,
        WorkingDir: containerInfo.Config.WorkingDir,
        User: containerInfo.Config.User,
        HostConfig: updatedHostConfig,
        name: containerInfo.Name.substring(1), // Remove leading slash
      };
      
      console.log(`🏗️ Creating new container: ${container.name} -> ${container.gluetunContainer.name}`);
      const newContainer = await this.docker.createContainer(createOptions);
      
      console.log(`▶️ Starting container: ${container.name}`);
      await newContainer.start();
      
      console.log(`✅ Successfully recreated container: ${container.name}`);
    } catch (error) {
      console.error(`❌ Failed to recreate container ${container.name}:`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<void> {
    console.log('🏥 Starting health check...');
    
    try {
      // Get all containers
      const allContainers = await this.getAllContainers();
      console.log(`📋 Found ${allContainers.length} total containers`);
      
      // Find Gluetun containers
      const gluetunContainers = await this.findGluetunContainers(allContainers);
      console.log(`🔌 Found ${gluetunContainers.length} Gluetun containers:`, gluetunContainers.map(g => g.name));
      
      if (gluetunContainers.length === 0) {
        console.log('⚠️ No Gluetun containers found. Skipping health check.');
        return;
      }
      
      // Find containers attached to Gluetun
      const attachedContainers = await this.findAttachedContainers(allContainers, gluetunContainers);
      console.log(`🔗 Found ${attachedContainers.length} containers attached to Gluetun:`, 
        attachedContainers.map(c => `${c.name} -> ${c.gluetunContainer.name}`));
      
      // Check health and redeploy if necessary
      const unhealthyContainers = attachedContainers.filter(c => this.isContainerUnhealthy(c));
      
      if (unhealthyContainers.length === 0) {
        console.log('✅ All attached containers are healthy');
        return;
      }
      
      console.log(`🚨 Found ${unhealthyContainers.length} unhealthy containers:`);
      for (const container of unhealthyContainers) {
        console.log(`  - ${container.name} (${container.state}) - Health: ${container.health?.status || 'no health check'}`);
      }
      
      // Redeploy unhealthy containers
      for (const container of unhealthyContainers) {
        try {
          await this.redeployContainer(container);
        } catch (error) {
          console.error(`❌ Failed to redeploy ${container.name}:`, error);
        }
      }
      
    } catch (error) {
      console.error('❌ Health check failed:', error);
    }
  }
}