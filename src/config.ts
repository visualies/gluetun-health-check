import type { HealthCheckConfig } from './types.js';

export function loadConfig(): HealthCheckConfig {
  return {
    checkInterval: parseInt(process.env.CHECK_INTERVAL || '300000'), // 5 minutes default
    gluetunImagePattern: process.env.GLUETUN_IMAGE_PATTERN || 'gluetun',
    unhealthyThreshold: parseInt(process.env.UNHEALTHY_THRESHOLD || '2'),
    dryRun: process.env.DRY_RUN === 'true',
  };
}

export function printConfig(config: HealthCheckConfig): void {
  console.log('🔧 Configuration:');
  console.log(`  Check Interval: ${config.checkInterval}ms (${config.checkInterval / 1000}s)`);
  console.log(`  Gluetun Image Pattern: ${config.gluetunImagePattern}`);
  console.log(`  Unhealthy Threshold: ${config.unhealthyThreshold}`);
  console.log(`  Dry Run: ${config.dryRun}`);
  console.log('');
} 