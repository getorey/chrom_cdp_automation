import { test, expect } from '@playwright/test';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { rm } from 'fs/promises';
import { spawn, execSync } from 'child_process';

test.describe.configure({ mode: 'serial', timeout: 120000 });

const TEST_FLOW_DIR = join(process.cwd(), 'flows', 'test-flows');
const LOGS_DIR = join(process.cwd(), 'logs');
const SCHEDULER_LOG_FILE = join(LOGS_DIR, 'scheduler.log');
const PID_FILE = join(LOGS_DIR, 'scheduler.pid');

test.describe('E2E Scheduler Execution Tests', () => {
  let testFlowPath: string;
  let schedulerProcess: ReturnType<typeof spawn> | null = null;

  function getMsUntilNextMinute(): number {
    const now = new Date();
    const nextMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);
    return nextMinute.getTime() - now.getTime() + 100;
  }

  test.beforeAll(async () => {
    if (!existsSync(TEST_FLOW_DIR)) {
      mkdirSync(TEST_FLOW_DIR, { recursive: true });
    }
    if (!existsSync(LOGS_DIR)) {
      mkdirSync(LOGS_DIR, { recursive: true });
    }
  });

  test.afterAll(async () => {
    try {
      await rm(TEST_FLOW_DIR, { recursive: true, force: true });
      await rm(SCHEDULER_LOG_FILE, { force: true });
      await rm(PID_FILE, { force: true });
    } catch {}
  });

  test.beforeEach(async () => {
    const flowContent = JSON.stringify({
      name: 'E2E Test Scheduled Flow',
      description: 'End-to-end scheduler execution test flow',
      url_prefix: 'https://example.com',
      steps: [
        {
          step_no: 1,
          action: 'navigate',
          target: 'https://example.com',
          description: 'Navigate to example'
        },
        {
          step_no: 2,
          action: 'wait',
          target: '1000',
          description: 'Wait for page load'
        }
      ]
    }, null, 2);

    testFlowPath = join(TEST_FLOW_DIR, `e2e-scheduler-flow-${Date.now()}.json`);
    writeFileSync(testFlowPath, flowContent);
  });

  test.afterEach(async () => {
    if (existsSync(testFlowPath)) {
      unlinkSync(testFlowPath);
    }
    if (schedulerProcess) {
      schedulerProcess.kill('SIGTERM');
      schedulerProcess = null;
    }
    try {
      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'ignore'
      });
    } catch {}
    try {
      await rm(process.cwd() + '/.scheduler-lock-*', { force: true, recursive: false });
    } catch {}
  });

  test.describe('Complete scheduler execution lifecycle', () => {
    test('should start scheduler, wait for execution, and verify logs', async () => {
      const initialLogSize = existsSync(SCHEDULER_LOG_FILE)
        ? readFileSync(SCHEDULER_LOG_FILE, 'utf-8').length
        : 0;

      const startOutput: string[] = [];

      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      schedulerProcess.stdout?.on('data', (data) => {
        startOutput.push(data.toString());
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const fullOutput = startOutput.join('');
      expect(fullOutput).toContain('Scheduler started successfully');
      expect(fullOutput).toContain('Run ID:');
      expect(fullOutput).toContain('Next execution:');

      expect(existsSync(PID_FILE)).toBe(true);

      const pidContent = readFileSync(PID_FILE, 'utf-8').trim();
      const pid = parseInt(pidContent, 10);
      expect(pid).toBeGreaterThan(0);

      const msUntilNextMinute = getMsUntilNextMinute();
      await new Promise(resolve => setTimeout(resolve, msUntilNextMinute));

      const finalLogSize = existsSync(SCHEDULER_LOG_FILE)
        ? readFileSync(SCHEDULER_LOG_FILE, 'utf-8').length
        : 0;

      expect(finalLogSize).toBeGreaterThan(initialLogSize);

      const logContent = readFileSync(SCHEDULER_LOG_FILE, 'utf-8');
      expect(logContent).toContain('Scheduler started with cron expression');
      expect(logContent).toContain('Next execution:');

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(PID_FILE)).toBe(false);
    });

    test('should execute scheduled flow and verify execution log entries', async () => {
      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(existsSync(PID_FILE)).toBe(true);

      const msUntilNextMinute = getMsUntilNextMinute();
      await new Promise(resolve => setTimeout(resolve, msUntilNextMinute));

      const logContent = readFileSync(SCHEDULER_LOG_FILE, 'utf-8');
      expect(logContent).toContain('Executing scheduled flow');

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const stopOutput: string[] = [];
      stopProcess.stdout?.on('data', (data) => {
        stopOutput.push(data.toString());
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const fullStopOutput = stopOutput.join('');
      expect(fullStopOutput).toContain('Scheduler stopped successfully');

      expect(existsSync(PID_FILE)).toBe(false);
    });

    test('should complete full execution cycle with multiple intervals', async ({ page }) => {
      test.slow();
      test.setTimeout(180000);
      const startTime = Date.now();

      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(existsSync(PID_FILE)).toBe(true);

      const initialLogLines = existsSync(SCHEDULER_LOG_FILE)
        ? readFileSync(SCHEDULER_LOG_FILE, 'utf-8').split('\n').filter(line => line.trim()).length
        : 0;

      const msUntilNextMinute = getMsUntilNextMinute();
      await new Promise(resolve => setTimeout(resolve, msUntilNextMinute + 65000));

      const finalLogLines = existsSync(SCHEDULER_LOG_FILE)
        ? readFileSync(SCHEDULER_LOG_FILE, 'utf-8').split('\n').filter(line => line.trim()).length
        : 0;

      expect(finalLogLines).toBeGreaterThan(initialLogLines);

      const logContent = readFileSync(SCHEDULER_LOG_FILE, 'utf-8');
      const executionMatches = (logContent.match(/Executing scheduled flow/g) || []).length;
      expect(executionMatches).toBeGreaterThanOrEqual(1);

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const stopOutput: string[] = [];
      stopProcess.stdout?.on('data', (data) => {
        stopOutput.push(data.toString());
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const fullStopOutput = stopOutput.join('');
      expect(fullStopOutput).toContain('Scheduler stopped successfully');

      const endTime = Date.now();
      const duration = endTime - startTime;
      expect(duration).toBeGreaterThan(65000);
      expect(duration).toBeLessThan(140000);

      expect(existsSync(PID_FILE)).toBe(false);
    });
  });

  test.describe('Scheduler execution with log verification', () => {
    test('should verify scheduler creates and writes to log file', async () => {
      const logFileBefore = existsSync(SCHEDULER_LOG_FILE);

      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const msUntilNextMinute = getMsUntilNextMinute();
      await new Promise(resolve => setTimeout(resolve, msUntilNextMinute));

      expect(existsSync(SCHEDULER_LOG_FILE)).toBe(true);

      const logContent = readFileSync(SCHEDULER_LOG_FILE, 'utf-8');
      expect(logContent).toBeTruthy();
      expect(logContent.length).toBeGreaterThan(0);

      const logLines = logContent.split('\n').filter(line => line.trim());
      expect(logLines.length).toBeGreaterThan(0);

      logLines.forEach(line => {
        expect(line).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
      });

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'ignore'
      });

      await new Promise(resolve => setTimeout(resolve, 500));
    });

    test('should verify log contains scheduler lifecycle messages', async () => {
      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const msUntilNextMinute = getMsUntilNextMinute();
      await new Promise(resolve => setTimeout(resolve, msUntilNextMinute));

      const logContent = readFileSync(SCHEDULER_LOG_FILE, 'utf-8');

      expect(logContent).toContain('Scheduler started with cron expression');
      expect(logContent).toContain('Next execution:');
      expect(logContent).toContain('Executing scheduled flow');

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'ignore'
      });

      await new Promise(resolve => setTimeout(resolve, 500));
    });

    test('should verify log entries have proper timestamp format', async () => {
      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const msUntilNextMinute = getMsUntilNextMinute();
      await new Promise(resolve => setTimeout(resolve, msUntilNextMinute));

      const logContent = readFileSync(SCHEDULER_LOG_FILE, 'utf-8');
      const lines = logContent.split('\n').filter(line => line.trim());

      const timestampRegex = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/;
      lines.forEach(line => {
        expect(line).toMatch(timestampRegex);
      });

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'ignore'
      });

      await new Promise(resolve => setTimeout(resolve, 500));
    });
  });

  test.describe('Scheduler execution with PID file management', () => {
    test('should create valid PID file on scheduler start', async () => {
      expect(existsSync(PID_FILE)).toBe(false);

      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(existsSync(PID_FILE)).toBe(true);

      const pidContent = readFileSync(PID_FILE, 'utf-8').trim();
      const pid = parseInt(pidContent, 10);

      expect(pidContent).not.toBe('');
      expect(pid).toBeGreaterThan(0);
      expect(Number.isInteger(pid)).toBe(true);

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'ignore'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(PID_FILE)).toBe(false);
    });

    test('should remove PID file on scheduler stop', async () => {
      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(existsSync(PID_FILE)).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'ignore'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(PID_FILE)).toBe(false);
    });
  });

  test.describe('Scheduler execution with lock file management', () => {
    test('should create and remove lock files during execution', async () => {
      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const { readdirSync } = await import('fs');
      const files = readdirSync(process.cwd());
      const lockFiles = files.filter((f: string) => f.startsWith('.scheduler-lock-'));

      expect(lockFiles.length).toBeGreaterThan(0);

      const lockFile = lockFiles[0];
      const lockFilePath = join(process.cwd(), lockFile);

      const lockContent = readFileSync(lockFilePath, 'utf-8');
      const lockData = JSON.parse(lockContent);

      expect(lockData).toHaveProperty('runId');
      expect(lockData).toHaveProperty('userId');
      expect(lockData).toHaveProperty('flowFile');
      expect(lockData).toHaveProperty('cronExpression');
      expect(lockData).toHaveProperty('startTime');

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'ignore'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const remainingFiles = readdirSync(process.cwd());
      const remainingLockFiles = remainingFiles.filter((f: string) => f.startsWith('.scheduler-lock-'));

      expect(remainingLockFiles.length).toBe(0);
    });
  });

  test.describe('Scheduler execution error handling', () => {
    test('should handle scheduler start with short interval', async () => {
      const startOutput: string[] = [];

      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      schedulerProcess.stdout?.on('data', (data) => {
        startOutput.push(data.toString());
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      const fullOutput = startOutput.join('');
      expect(fullOutput).toContain('Scheduler started successfully');

      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(existsSync(PID_FILE)).toBe(true);

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'ignore'
      });

      await new Promise(resolve => setTimeout(resolve, 500));
    });
  });
});
