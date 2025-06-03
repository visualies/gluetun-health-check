#!/usr/bin/env bun

import { DockerClient } from './docker-client.js';
import { loadConfig, printConfig } from './config.js';
import { HealthCheckConfig } from './types.js';

async function main() {
  console.log('🚀 Starting Gluetun Health Check Monitor');
  console.log('=====================================');
  
  const config = loadConfig();
  printConfig(config);
  
  const dockerClient = new DockerClient(config);
  
  // Perform initial health check
  await dockerClient.healthCheck();
  
  // Set up periodic health checks
  console.log(`⏰ Setting up periodic health checks every ${config.checkInterval / 1000} seconds`);
  
  const intervalId = setInterval(async () => {
    try {
      await dockerClient.healthCheck();
    } catch (error) {
      console.error('❌ Periodic health check failed:', error);
    }
  }, config.checkInterval);
  
  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Received shutdown signal, cleaning up...');
    clearInterval(intervalId);
    console.log('✅ Cleanup completed, exiting...');
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  console.log('✅ Health check monitor is running...');
  console.log('Press Ctrl+C to stop');
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  console.error('❌ Application failed to start:', error);
  process.exit(1);
}); 