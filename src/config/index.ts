import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

export interface AppConfig {
  paths: {
    logs: string;
    flows: string;
    artifacts: string;
    templates: string;
    cache: string;
  };
  cdp: {
    port: number;
    host: string;
  };
  logging: {
    enabled: boolean;
    format: 'csv' | 'json';
    retentionDays: number;
  };
  artifacts: {
    captureScreenshots: boolean;
    captureHtml: boolean;
    captureConsole: boolean;
    retentionDays: number;
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  paths: {
    logs: './logs',
    flows: './flows',
    artifacts: './artifacts',
    templates: './templates',
    cache: './cache',
  },
  cdp: {
    port: 9222,
    host: 'localhost',
  },
  logging: {
    enabled: true,
    format: 'csv',
    retentionDays: 30,
  },
  artifacts: {
    captureScreenshots: true,
    captureHtml: true,
    captureConsole: false,
    retentionDays: 7,
  },
};

const CONFIG_FILE_NAME = 'config.json';

let cachedConfig: AppConfig | null = null;

export function getConfigPath(): string {
  return join(process.cwd(), CONFIG_FILE_NAME);
}

export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    console.log(`[Config] Config file not found at ${configPath}, creating default config...`);
    createDefaultConfig(configPath);
    cachedConfig = DEFAULT_CONFIG;
    return DEFAULT_CONFIG;
  }

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(configContent);
    cachedConfig = mergeConfig(DEFAULT_CONFIG, userConfig);
    return cachedConfig;
  } catch (error) {
    console.error(`[Config] Error loading config: ${error instanceof Error ? error.message : String(error)}`);
    console.log('[Config] Using default configuration');
    return DEFAULT_CONFIG;
  }
}

export function reloadConfig(): AppConfig {
  cachedConfig = null;
  return loadConfig();
}

export function createDefaultConfig(configPath: string): void {
  try {
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    console.log(`[Config] Default config created at ${configPath}`);
  } catch (error) {
    console.error(`[Config] Failed to create default config: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function mergeConfig(defaults: AppConfig, user: Partial<AppConfig>): AppConfig {
  return {
    paths: {
      ...defaults.paths,
      ...user.paths,
    },
    cdp: {
      ...defaults.cdp,
      ...user.cdp,
    },
    logging: {
      ...defaults.logging,
      ...user.logging,
    },
    artifacts: {
      ...defaults.artifacts,
      ...user.artifacts,
    },
  };
}

/**
 * Check if running in pkg environment
 * In pkg, process.pkg is set to true
 */
function isPkgEnvironment(): boolean {
  return !!(process as any).pkg || process.execPath.endsWith('.exe') && !process.execPath.includes('node');
}

/**
 * Get the base directory for resolving paths
 * - In pkg environment: use executable's directory
 * - In normal Node.js: use process.cwd()
 */
function getBaseDir(): string {
  if (isPkgEnvironment()) {
    // In pkg environment, use the directory where the .exe is located
    return dirname(process.execPath);
  }
  // In normal Node.js environment, use current working directory
  return process.cwd();
}

export function resolvePath(configPath: string): string {
  if (configPath.startsWith('./') || configPath.startsWith('.\\')) {
    // Use getBaseDir() instead of process.cwd() to support pkg environment
    return join(getBaseDir(), configPath.slice(2));
  }
  if (configPath.startsWith('~/') || configPath.startsWith('~\\')) {
    const homedir = process.env.HOME || process.env.USERPROFILE || getBaseDir();
    return join(homedir, configPath.slice(2));
  }
  return configPath;
}

export function getLogsPath(): string {
  return resolvePath(loadConfig().paths.logs);
}

export function getFlowsPath(): string {
  return resolvePath(loadConfig().paths.flows);
}

export function getArtifactsPath(): string {
  return resolvePath(loadConfig().paths.artifacts);
}

export function getTemplatesPath(): string {
  return resolvePath(loadConfig().paths.templates);
}

export function getCachePath(): string {
  return resolvePath(loadConfig().paths.cache);
}
