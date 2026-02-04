import { CronJob } from 'cron';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { runFlow } from '../runner/flow-executor.js';
import { CDPConnector } from '../runner/cdp-connector.js';
import { load } from 'js-yaml';
import { validateFlowData } from '../validation/validator.js';
import { generateRunId } from '../utils/id.js';
import { getLogsPath } from '../config/index.js';
import { Flow } from '../models/flow.js';

const logsPath = getLogsPath();
export const SCHEDULER_LOG_FILE = join(logsPath, 'scheduler.log');

function logToFile(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  writeFileSync(SCHEDULER_LOG_FILE, logMessage, { flag: 'a' });
}

interface SchedulerResult {
  job: CronJob<null, null>;
  stopCallback: () => void;
}

export interface StartSchedulerOptions {
  flowFile: string;
  cronExpression: string;
  runId: string;
  userId: string;
}

export function startScheduler(
  flowFile: string,
  cronExpression: string,
  runId: string,
  userId: string,
): SchedulerResult {
  const lockFilePath = join(process.cwd(), `.scheduler-lock-${runId}.lock`);

  const schedulerRunLogsDir = getLogsPath();
  if (!existsSync(schedulerRunLogsDir)) {
    mkdirSync(schedulerRunLogsDir, { recursive: true });
  }

  const flowContent = readFileSync(flowFile, 'utf-8');
  const flow: Flow = load(flowContent) as Flow;

  writeFileSync(lockFilePath, JSON.stringify({
    runId,
    userId,
    pid: process.pid,
    startTime: new Date().toISOString(),
    flowFile,
    cronExpression,
  }), 'utf-8');

  logToFile(`Scheduler started with runId: ${runId}, userId: ${userId}, pid: ${process.pid}`);

  const job = CronJob.from({
    cronTime: cronExpression,
    onTick: async () => {
      const executionId = generateRunId();
      const startTime = new Date().toISOString();
      
      logToFile(`[${executionId}] Starting scheduled flow execution at ${startTime}`);
      
      try {
        const cdpConnector = new CDPConnector();
        await runFlow(flow, cdpConnector);
        
        const endTime = new Date().toISOString();
        logToFile(`[${executionId}] Flow execution completed successfully at ${endTime}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const endTime = new Date().toISOString();
        logToFile(`[${executionId}] Flow execution failed at ${endTime}: ${errorMessage}`);
      }
    },
    start: true,
    timeZone: 'Asia/Seoul',
  });

  logToFile(`Scheduler job configured with cron schedule: ${cronExpression}`);

  const stopCallback = (): void => {
    job.stop();
    try {
      if (existsSync(lockFilePath)) {
        unlinkSync(lockFilePath);
        logToFile(`[${runId}] Lock file removed`);
      }
    } catch (error) {
      const message = `[${runId}] Failed to remove lock file: ${error instanceof Error ? error.message : String(error)}`;
      logToFile(message);
    }
  };

  return { job, stopCallback };
}

export interface SchedulerStartOptions {
  flowFile: string;
  schedule: string;
}

export function schedulerStart(flowFile: string, schedule: string): void {
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

    const runId = generateRunId();
    const userId = process.env.USER || 'unknown';

    const schedulerLogsDir = getLogsPath();
    if (!existsSync(schedulerLogsDir)) {
      mkdirSync(schedulerLogsDir, { recursive: true });
    }

    const schedulerResult = startScheduler(flowFile, schedule, runId, userId);

    const schedulerPidFilePath = join(schedulerLogsDir, 'scheduler.pid');
    writeFileSync(schedulerPidFilePath, String(process.pid), 'utf-8');

    console.log(`✓ Scheduler started successfully`);
    console.log(`  Run ID: ${runId}`);
    console.log(`  User ID: ${userId}`);
    console.log(`  Flow file: ${flowFile}`);
    console.log(`  Schedule: ${schedule}`);
    console.log(`  PID: ${process.pid}`);
    console.log(`  Logs: ${SCHEDULER_LOG_FILE}`);
    console.log('');
    console.log('To stop the scheduler, run: chrome-cdp scheduler stop');

    process.on('SIGINT', () => {
      console.log('\nReceived SIGINT, stopping scheduler...');
      schedulerResult.stopCallback();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\nReceived SIGTERM, stopping scheduler...');
      schedulerResult.stopCallback();
      process.exit(0);
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`✗ Failed to start scheduler: ${errorMessage}`);
    process.exit(1);
  }
}

export function schedulerStop(): void {
  try {
    const stopLogsDir = getLogsPath();
    const stopPidFilePath = join(stopLogsDir, 'scheduler.pid');

    if (!existsSync(stopPidFilePath)) {
      console.error(`✗ Scheduler PID file not found at: ${stopPidFilePath}`);
      console.error(`  The scheduler may not be running or the PID file was deleted.`);
      process.exit(1);
    }

    const pidContent = readFileSync(stopPidFilePath, 'utf-8');
    const pid = parseInt(pidContent.trim(), 10);

    if (isNaN(pid)) {
      console.error(`✗ Invalid PID found in scheduler PID file: ${pidContent}`);
      process.exit(1);
    }

    try {
      process.kill(pid, 'SIGTERM');
      console.log(`✓ Scheduler stopped (PID: ${pid})`);
      
      try {
        unlinkSync(stopPidFilePath);
      } catch {
        // Ignore errors when removing PID file
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`✗ Failed to stop scheduler: ${errorMessage}`);
      process.exit(1);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`✗ Error stopping scheduler: ${errorMessage}`);
    process.exit(1);
  }
}
