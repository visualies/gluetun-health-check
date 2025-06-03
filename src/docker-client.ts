import Docker from 'dockerode';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ContainerInfo, GluetunContainer, AttachedContainer, HealthCheckConfig } from './types.js';

const execAsync = promisify(exec);

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
    
    for (const container of containers) {
      // Skip if this is a Gluetun container itself
      if (gluetunContainers.some(g => g.id === container.id)) {
        continue;
      }
      
      // Check if network mode is "container:X" where X is a Gluetun container
      if (container.networkMode.startsWith('container:')) {
        const targetContainerId = container.networkMode.replace('container:', '');
        
        // Check if the target container is one of our Gluetun containers
        const gluetunContainer = gluetunContainers.find(g => 
          g.id === targetContainerId || g.id.startsWith(targetContainerId)
        );
        
        if (gluetunContainer) {
          const attachedContainer: AttachedContainer = {
            ...container,
            gluetunContainer,
          };
          
          // Extract compose project and file information from labels
          const composeProject = container.labels['com.docker.compose.project'];
          const composeConfigFiles = container.labels['com.docker.compose.project.config_files'];
          
          if (composeProject) {
            attachedContainer.composeProject = composeProject;
          }
          
          if (composeConfigFiles) {
            attachedContainer.composeFile = composeConfigFiles;
          }
          
          attachedContainers.push(attachedContainer);
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
    
    // If container has health check, use that
    if (container.health) {
      return container.health.status === 'unhealthy' && 
             container.health.failingStreak >= this.config.unhealthyThreshold;
    }
    
    // If no health check is defined, assume it's healthy if running
    return false;
  }

  async redeployContainer(container: AttachedContainer): Promise<void> {
    console.log(`🔄 Redeploying container: ${container.name}`);
    
    if (!container.composeProject) {
      console.error(`❌ No compose project found for container: ${container.name}`);
      return;
    }
    
    // Extract the relative path from the compose file path
    let composeFilePath = './docker-compose.yml'; // default
    
    if (container.composeFile) {
      // Extract the relative path from the absolute path
      // Example: "/etc/dokploy/compose/seedbox-prowlarr-bgcxe9/code/prowlarr/docker-compose.yml"
      // We want to extract "prowlarr/docker-compose.yml" or similar
      const parts = container.composeFile.split('/');
      const codeIndex = parts.findIndex(part => part === 'code');
      if (codeIndex !== -1 && codeIndex < parts.length - 1) {
        composeFilePath = './' + parts.slice(codeIndex + 1).join('/');
      }
    }
    
    // Try docker compose (new) first, fallback to docker-compose (legacy)
    const commands = [
      `docker compose -p ${container.composeProject} -f ${composeFilePath} up -d --build --remove-orphans --force-recreate`,
      `docker-compose -p ${container.composeProject} -f ${composeFilePath} up -d --build --remove-orphans --force-recreate`
    ];
    
    if (this.config.dryRun) {
      console.log(`🔍 DRY RUN: Would execute: ${commands[0]}`);
      return;
    }
    
    for (const command of commands) {
      console.log(`🔧 Executing: ${command}`);
      
      try {
        const { stdout, stderr } = await execAsync(command);
        
        if (stdout) {
          console.log(`✅ Redeploy stdout: ${stdout}`);
        }
        
        if (stderr) {
          console.log(`⚠️ Redeploy stderr: ${stderr}`);
        }
        
        console.log(`✅ Successfully redeployed container: ${container.name}`);
        return; // Success, exit the loop
      } catch (error: any) {
        console.log(`⚠️ Command failed: ${command}`);
        
        // If this is the last command, throw the error
        if (command === commands[commands.length - 1]) {
          console.error(`❌ Failed to redeploy container ${container.name}:`, error);
          throw error;
        }
        
        // Otherwise, try the next command
        console.log(`🔄 Trying fallback command...`);
      }
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