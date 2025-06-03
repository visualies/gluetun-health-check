#!/usr/bin/env node

import { DockerClient } from './docker-client.js';
import { loadConfig } from './config.js';

async function testDockerConnection() {
  console.log('🧪 Testing Docker connection and basic functionality...\n');
  
  const config = loadConfig();
  // Enable dry run for testing
  config.dryRun = true;
  
  const dockerClient = new DockerClient(config);
  
  try {
    // Test basic container listing
    console.log('📋 Testing container listing...');
    const containers = await dockerClient.getAllContainers();
    console.log(`✅ Found ${containers.length} containers\n`);
    
    // Test Gluetun discovery
    console.log('🔌 Testing Gluetun discovery...');
    const gluetunContainers = await dockerClient.findGluetunContainers(containers);
    console.log(`✅ Found ${gluetunContainers.length} Gluetun containers\n`);
    
    if (gluetunContainers.length > 0) {
      console.log('Gluetun containers:');
      gluetunContainers.forEach(g => {
        console.log(`  - ${g.name} (${g.image})`);
      });
      console.log('');
    }
    
    // Test attached container discovery
    console.log('🔗 Testing attached container discovery...');
    const attachedContainers = await dockerClient.findAttachedContainers(containers, gluetunContainers);
    console.log(`✅ Found ${attachedContainers.length} attached containers\n`);
    
    if (attachedContainers.length > 0) {
      console.log('Attached containers:');
      attachedContainers.forEach(c => {
        console.log(`  - ${c.name} -> ${c.gluetunContainer.name}`);
        console.log(`    State: ${c.state}`);
        console.log(`    Health: ${c.health?.status || 'no health check'}`);
        console.log(`    Compose Project: ${c.composeProject || 'none'}`);
        console.log(`    Compose File: ${c.composeFile || 'none'}`);
        console.log('');
      });
    }
    
    // Perform a test health check
    console.log('🏥 Performing test health check...');
    await dockerClient.healthCheck();
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testDockerConnection().catch(error => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
}); 