export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  health?: {
    status: string;
    failingStreak: number;
    log: Array<{
      start: string;
      end: string;
      exitCode: number;
      output: string;
    }>;
  };
  networkMode: string;
  labels: Record<string, string>;
}

export interface GluetunContainer {
  id: string;
  name: string;
  image: string;
}

export interface AttachedContainer extends ContainerInfo {
  gluetunContainer: GluetunContainer;
}

export interface HealthCheckConfig {
  checkInterval: number; // in milliseconds
  gluetunImagePattern: string;
  unhealthyThreshold: number; // kept for potential future use
  dryRun: boolean;
} 