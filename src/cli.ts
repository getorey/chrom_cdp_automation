#!/usr/bin/env node

import { Command } from 'commander';
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { load } from 'js-yaml';
import { validateFlowData } from './validation/validator.js';
import { connectToChrome, selectTabByUrlPrefix, CDPConnector } from './runner/cdp-connector.js';
import { executeFlow } from './runner/flow-executor.js';
import { createLogger } from './logger/index.js';
import { generateRunId } from './utils/id.js';
import { acquireLock, releaseLock } from './lock/index.js';
import { Flow, LockFile } from './models/flow.js';
import { LOCK_FILE_PATH } from './lock/index.js';
import { loadConfig, getFlowsPath, getLogsPath } from './config/index.js';

loadConfig();

const program = new Command();

program
  .name('chrome-cdp')
  .description('Chrome DevTools Protocol automation runner')
  .version('1.0.0');

program
  .command('run <flow-file>')
  .description('Run a YAML flow file')
  .option('--mode <mode>', 'Execution mode: manual, cli, or scheduler', 'manual')
  .action(async (flowFile: string, options: { mode: string }) => {
    const { mode } = options;

    if (mode !== 'manual' && mode !== 'cli' && mode !== 'scheduler') {
      console.error('✗ Invalid mode. Must be one of: manual, cli, scheduler');
      process.exit(2);
    }

    try {
      const fileContent = readFileSync(flowFile, 'utf-8');
      const data = load(fileContent);

      const validationResult = validateFlowData(data);
      if (!validationResult.valid) {
        console.error(`✗ Flow file "${flowFile}" has validation errors:`);
        if (validationResult.errors) {
          validationResult.errors.forEach((error) => {
            const pathInfo = error.path ? ` (path: ${error.path})` : '';
            console.error(`  - ${error.message}${pathInfo}`);
          });
        }
        process.exit(3);
      }

      const flow = data as Flow;

      const lockAcquired = await acquireLock(flowFile);
      if (!lockAcquired) {
        console.error('✗ Unable to acquire lock. Another flow execution may be in progress.');
        process.exit(5);
      }

      try {
        const run_id = generateRunId();
        const user_id = process.env.USER || 'unknown';

        const browser = await connectToChrome();
        const page = await selectTabByUrlPrefix(browser, flow.url_prefix);

        if (!page) {
          console.error(`✗ No tab found matching URL prefix: ${flow.url_prefix}`);
          await browser.close();
          process.exit(4);
        }

        const cdpConnector = new CDPConnector();
        await cdpConnector.connect(page);
        const logger = await createLogger(run_id, user_id);
        const logsPath = getLogsPath();

        try {
          await executeFlow(page, flow, run_id, user_id, logger, cdpConnector);
          console.log(`✓ Flow "${flow.name}" executed successfully in ${mode} mode`);
          console.log(`  Run ID: ${run_id}`);
          console.log(`  Logs: ${logsPath}/${run_id}.csv`);
          process.exit(0);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`✗ Flow execution failed: ${errorMessage}`);
          console.error(`  Run ID: ${run_id}`);
          console.error(`  Logs: ${logsPath}/${run_id}.csv`);
          process.exit(1);
        } finally {
          await browser.close();
        }
      } finally {
        await releaseLock();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`✗ Error: ${errorMessage}`);
      process.exit(4);
    }
  });

program
  .command('validate <flow-file>')
  .description('Validate a YAML flow file against the schema')
  .action((flowFile: string) => {
    try {
      const fileContent = readFileSync(flowFile, 'utf-8');
      const data = load(fileContent);
      const result = validateFlowData(data);

      if (result.valid) {
        console.log(`✓ Flow file "${flowFile}" is valid`);
        process.exit(0);
      } else {
        console.error(`✗ Flow file "${flowFile}" has validation errors:`);
        if (result.errors) {
          result.errors.forEach((error) => {
            const pathInfo = error.path ? ` (path: ${error.path})` : '';
            console.error(`  - ${error.message}${pathInfo}`);
          });
        }
        process.exit(3);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✗ Error reading or parsing flow file: ${message}`);
      process.exit(3);
    }
  });

program
  .command('schedule <flow-file>')
  .description('Schedule a flow file to run periodically')
  .option('--cron <pattern>', 'Cron pattern for scheduling')
  .action((flowFile: string, options: { cron?: string }) => {
    console.log(`Scheduling flow: ${flowFile}`);
    if (options.cron) {
      console.log(`Cron pattern: ${options.cron}`);
    }
    // TODO: Implement scheduling
  });

program
  .command('scheduler')
  .description('Scheduler management')
  .addCommand(
    new Command('start')
      .description('Start scheduler daemon')
      .argument('<flow-file>', 'Path to flow file')
      .requiredOption('--schedule <cron-expression>', 'Cron expression (e.g., "* * * * *")')
      .action(async (flowFile: string, options: { schedule: string }) => {
        const { schedulerStart } = await import('./scheduler/index.js');
        schedulerStart(flowFile, options.schedule);
      })
  )
  .addCommand(
    new Command('stop')
      .description('Stop scheduler daemon')
      .action(async () => {
        const { schedulerStop } = await import('./scheduler/index.js');
        schedulerStop();
      })
  )
  .addCommand(
    new Command('status')
      .description('Show scheduler status')
      .action(async () => {
        const { existsSync, readFileSync } = await import('fs');
        const { join } = await import('path');
        const PID_FILE = join(process.cwd(), 'logs', 'scheduler.pid');

        if (!existsSync(PID_FILE)) {
          console.log('Scheduler is not running');
          process.exit(0);
        }

        const pidContent = readFileSync(PID_FILE, 'utf-8').trim();
        const pid = parseInt(pidContent, 10);

        console.log('Scheduler is running');
        console.log(`  PID: ${pid}`);
        console.log(`  PID file: ${PID_FILE}`);
        process.exit(0);
      })
  );

program
  .command('check-cdp')
  .description('Check Chrome DevTools Protocol connection')
  .option('--port <port>', 'CDP port number', '9222')
  .action(async (options: { port: string }) => {
    const port = parseInt(options.port, 10);
    if (isNaN(port)) {
      console.error('✗ Invalid port number: must be a valid integer');
      process.exit(5);
    }

    try {
      const browser = await connectToChrome(port);
      const version = await browser.version();
      console.log(`✓ Connected to Chrome via CDP on port ${port}`);
      console.log(`  Chrome version: ${version}`);
      await browser.close();
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✗ ${message}`);
      console.error('');
      console.error('To enable CDP in Chrome:');
      console.error('  1. Start Chrome with: chrome --remote-debugging-port=9222');
      console.error('  2. Close all existing Chrome windows before starting with CDP');
      console.error('  3. On macOS: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
      process.exit(5);
    }
  });

program
  .command('status')
  .description('Show active automation session status')
  .action(() => {
    try {
      const lockContent = readFileSync(LOCK_FILE_PATH, 'utf-8');
      const lock: LockFile = JSON.parse(lockContent);
      
      console.log('Active automation session:');
      console.log(`  PID: ${lock.pid}`);
      console.log(`  Flow file: ${lock.flow_file}`);
      console.log(`  Status: ${lock.status}`);
      console.log(`  Created at: ${lock.created_at}`);
      process.exit(0);
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        console.log('No active automation session');
        process.exit(0);
      } else if (error instanceof SyntaxError) {
        console.error('✗ Corrupted lock file');
        process.exit(5);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`✗ Error reading lock file: ${message}`);
        process.exit(5);
      }
    }
  });

program
  .command('flow')
  .description('Manage registered flows')
  .addCommand(
    new Command('register')
      .description('Register a flow file to the flows directory')
      .argument('<flow-file>', 'Path to flow YAML file')
      .action((flowFile: string) => {
        if (!existsSync(flowFile)) {
          console.error(`✗ Flow file not found: ${flowFile}`);
          process.exit(3);
        }

        let flowData: Flow;
        try {
          const fileContent = readFileSync(flowFile, 'utf-8');
          const data = load(fileContent);
          const validationResult = validateFlowData(data);
          
          if (!validationResult.valid) {
            console.error(`✗ Flow file "${flowFile}" has validation errors:`);
            if (validationResult.errors) {
              validationResult.errors.forEach((error) => {
                const pathInfo = error.path ? ` (path: ${error.path})` : '';
                console.error(`  - ${error.message}${pathInfo}`);
              });
            }
            process.exit(3);
          }
          
          flowData = data as Flow;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`✗ Error reading or parsing flow file: ${errorMessage}`);
          process.exit(3);
        }

        const flowsDir = getFlowsPath();
        if (!existsSync(flowsDir)) {
          mkdirSync(flowsDir, { recursive: true });
        }

        const flowId = randomUUID();

        const targetPath = join(flowsDir, `${flowId}.yaml`);
        copyFileSync(flowFile, targetPath);

        const registryPath = join(flowsDir, 'registry.json');
        const registeredAt = new Date().toISOString();
        const registryEntry = {
          id: flowId,
          name: flowData.name,
          description: flowData.description || '',
          originalPath: flowFile,
          registeredAt: registeredAt
        };

        let registry: Array<{ id: string; name: string; description: string; originalPath: string; registeredAt: string }> = [];
        
        if (existsSync(registryPath)) {
          try {
            const registryContent = readFileSync(registryPath, 'utf-8');
            registry = JSON.parse(registryContent);
          } catch (error) {
            console.warn('Warning: registry.json is corrupt, starting with new registry');
          }
        }

        registry.push(registryEntry);
        writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');

        console.log(`✓ Flow "${flowData.name}" registered successfully`);
        console.log(`  Flow ID: ${flowId}`);
        console.log(`  Copy location: ${targetPath}`);
        process.exit(0);
      })
  )
  .addCommand(
    new Command('list')
      .description('List all registered flows')
      .action(() => {
        const flowsDir = getFlowsPath();
        const registryPath = join(flowsDir, 'registry.json');

        if (!existsSync(registryPath)) {
          console.log('No flows registered yet. Use "chrome-cdp flow register <flow-file>" to register a flow.');
          process.exit(0);
        }

        let registry: Array<{ id: string; name: string; description: string; originalPath: string; registeredAt: string }>;

        try {
          const registryContent = readFileSync(registryPath, 'utf-8');
          registry = JSON.parse(registryContent);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`✗ Error reading registry: ${errorMessage}`);
          process.exit(3);
        }

        if (!Array.isArray(registry) || registry.length === 0) {
          console.log('No flows registered yet. Use "chrome-cdp flow register <flow-file>" to register a flow.');
          process.exit(0);
        }

        const tableData = registry.map((flow) => ({
          'ID': flow.id,
          'Name': flow.name,
          'Description': flow.description,
          'Registered': flow.registeredAt
        }));

        console.table(tableData);
        process.exit(0);
      })
  )
  .addCommand(
    new Command('delete')
      .description('Delete a registered flow')
      .argument('<flow-id>', 'Flow ID to delete')
      .action((flowId: string) => {
        const flowsDir = getFlowsPath();
        const registryPath = join(flowsDir, 'registry.json');

        if (!existsSync(registryPath)) {
          console.error('✗ No flows registered yet');
          process.exit(3);
        }

        let registry: Array<{ id: string; name: string; description: string; originalPath: string; registeredAt: string }>;

        try {
          const registryContent = readFileSync(registryPath, 'utf-8');
          registry = JSON.parse(registryContent);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`✗ Error reading registry: ${errorMessage}`);
          process.exit(3);
        }

        if (!Array.isArray(registry)) {
          console.error('✗ Invalid registry format');
          process.exit(3);
        }

        const flowIndex = registry.findIndex((flow) => flow.id === flowId);

        if (flowIndex === -1) {
          console.error(`✗ Flow with ID "${flowId}" not found`);
          process.exit(3);
        }

        const flowEntry = registry[flowIndex];
        const flowName = flowEntry ? flowEntry.name : 'Unknown';
        const flowFilePath = join(flowsDir, `${flowId}.yaml`);

        try {
          if (existsSync(flowFilePath)) {
            unlinkSync(flowFilePath);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`✗ Error deleting flow file: ${errorMessage}`);
          process.exit(3);
        }

        registry.splice(flowIndex, 1);
        writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');

        console.log(`✓ Flow "${flowName}" deleted successfully`);
        console.log(`  Flow ID: ${flowId}`);
        process.exit(0);
      })
  );

program.parse(process.argv);
