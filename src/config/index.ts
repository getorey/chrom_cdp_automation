import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface AppConfig {
  paths: {
    logs: string;
    flows: string;
    artifacts: string;
    templates: string;
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

export function resolvePath(configPath: string): string {
  if (configPath.startsWith('./') || configPath.startsWith('.\\')) {
    return join(process.cwd(), configPath.slice(2));
  }
  if (configPath.startsWith('~/') || configPath.startsWith('~\\')) {
    const homedir = process.env.HOME || process.env.USERPROFILE || process.cwd();
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
