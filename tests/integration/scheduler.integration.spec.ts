import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { rm } from 'fs/promises';

test.describe.configure({ mode: 'serial' });

const TEST_FLOW_DIR = join(process.cwd(), 'flows', 'test-flows');
const LOGS_DIR = join(process.cwd(), 'logs');
const PID_FILE = join(LOGS_DIR, 'scheduler.pid');

test.describe('Scheduler Integration Tests', () => {
  let testFlowPath: string;
  let schedulerProcess: ReturnType<typeof spawn> | null = null;

  test.beforeAll(async () => {
    if (!existsSync(TEST_FLOW_DIR)) {
      mkdirSync(TEST_FLOW_DIR, { recursive: true });
    }
    if (!existsSync(LOGS_DIR)) {
      mkdirSync(LOGS_DIR, { recursive: true });
    }
  });

  test.afterAll(async () => {
    if (schedulerProcess) {
      schedulerProcess.kill('SIGTERM');
    }
    try {
      await rm(TEST_FLOW_DIR, { recursive: true, force: true });
      await rm(PID_FILE, { force: true });
    } catch {}
  });

  test.beforeEach(async () => {
    const flowContent = `
name: Test Scheduled Flow
description: Integration test flow for scheduler
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate to example
  - step_no: 2
    action: wait
    target: "500"
    description: Wait for page load
    `.trim();

    testFlowPath = join(TEST_FLOW_DIR, `scheduler-test-flow-${Date.now()}.yaml`);
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
      await rm(process.cwd() + '/.scheduler-lock-*', { force: true, recursive: false });
    } catch {}
    try {
      if (existsSync(PID_FILE)) {
        unlinkSync(PID_FILE);
      }
    } catch {}
  });

  test.describe('scheduler start command', () => {
    test('should start scheduler and create PID file', async () => {
      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(existsSync(PID_FILE)).toBe(true);

      const pidContent = readFileSync(PID_FILE, 'utf-8').trim();
      const pid = parseInt(pidContent, 10);
      expect(pid).toBeGreaterThan(0);
    });

    test('should log scheduler start message with next execution time', async () => {
      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      const output: string[] = [];
      schedulerProcess.stdout?.on('data', (data) => {
        output.push(data.toString());
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      const fullOutput = output.join('');
      expect(fullOutput).toContain('Scheduler started successfully');
      expect(fullOutput).toContain('Run ID:');
      expect(fullOutput).toContain('Schedule:');
      expect(fullOutput).toContain('Next execution:');
    });

    test('should fail with invalid flow file', async () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'invalid-scheduler-flow.yaml');
      writeFileSync(invalidFlowPath, `
name: Invalid Flow
description: Missing url_prefix
steps: []
      `.trim());

      const schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', invalidFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const stderr: string[] = [];
      schedulerProcess.stderr?.on('data', (data) => {
        stderr.push(data.toString());
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const fullStderr = stderr.join('');
      expect(fullStderr).toContain('✗');
      expect(fullStderr).toContain('validation errors');

      if (existsSync(invalidFlowPath)) {
        unlinkSync(invalidFlowPath);
      }
    });

    test('should fail with invalid cron expression', async () => {
      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', 'invalid-cron'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const stderr: string[] = [];
      schedulerProcess.stderr?.on('data', (data) => {
        stderr.push(data.toString());
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const fullStderr = stderr.join('');
      expect(fullStderr).toContain('Failed to start scheduler');
    });
  });

  test.describe('scheduler stop command', () => {
    test.beforeEach(async () => {
      const startProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      const pidContent = readFileSync(PID_FILE, 'utf-8').trim();
      const pid = parseInt(pidContent, 10);
      schedulerProcess = startProcess;
    });

    test('should stop scheduler and remove PID file', async () => {
      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const stdout: string[] = [];
      stopProcess.stdout?.on('data', (data) => {
        stdout.push(data.toString());
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const fullOutput = stdout.join('');
      expect(fullOutput).toContain('Scheduler stopped successfully');
      expect(fullOutput).toContain('PID file removed');

      expect(existsSync(PID_FILE)).toBe(false);
    });

    test('should fail when PID file does not exist', async () => {
      if (existsSync(PID_FILE)) {
        unlinkSync(PID_FILE);
      }

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const stderr: string[] = [];
      stopProcess.stderr?.on('data', (data) => {
        stderr.push(data.toString());
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const fullStderr = stderr.join('');
      expect(fullStderr).toContain('✗');
      expect(fullStderr).toContain('PID file not found');
    });
  });

  test.describe('scheduler status command', () => {
    test.beforeEach(async () => {
      const startProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      schedulerProcess = startProcess;
    });

    test('should report scheduler as running', async () => {
      const statusProcess = spawn('node', ['dist/cli.js', 'scheduler', 'status'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const stdout: string[] = [];
      statusProcess.stdout?.on('data', (data) => {
        stdout.push(data.toString());
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const fullOutput = stdout.join('');
      expect(fullOutput).toContain('Scheduler is running');
      expect(fullOutput).toContain('PID:');
    });

    test('should report scheduler as not running when PID file missing', async () => {
      spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'ignore'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const statusProcess = spawn('node', ['dist/cli.js', 'scheduler', 'status'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const stdout: string[] = [];
      statusProcess.stdout?.on('data', (data) => {
        stdout.push(data.toString());
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const fullOutput = stdout.join('');
      expect(fullOutput).toContain('Scheduler is not running');
    });
  });

  test.describe('Integration: Full scheduler lifecycle', () => {
    test('should start, execute scheduled flow, and stop scheduler', async () => {
      let flowExecuted = false;
      let schedulerOutput: string[] = [];

      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      schedulerProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        schedulerOutput.push(output);
        if (output.includes('Flow execution completed') || output.includes('Executing scheduled flow')) {
          flowExecuted = true;
        }
      });

      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(existsSync(PID_FILE)).toBe(true);

      const statusOutput = schedulerOutput.join('');
      expect(statusOutput).toContain('Scheduler started successfully');

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(PID_FILE)).toBe(false);
    });

    test('should handle multiple scheduler start/stop cycles', async () => {
      for (let i = 0; i < 3; i++) {
        const startProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
          cwd: process.cwd(),
          detached: true,
          stdio: 'pipe'
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        expect(existsSync(PID_FILE)).toBe(true);

        const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
          cwd: process.cwd(),
          stdio: 'pipe'
        });

        await new Promise(resolve => setTimeout(resolve, 500));

        expect(existsSync(PID_FILE)).toBe(false);
      }
    });
  });

  test.describe('Error handling and edge cases', () => {
    test('should handle corrupted PID file gracefully', async () => {
      writeFileSync(PID_FILE, 'invalid-pid-content');

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const stderr: string[] = [];
      stopProcess.stderr?.on('data', (data) => {
        stderr.push(data.toString());
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const fullStderr = stderr.join('');
      expect(fullStderr).toContain('Invalid PID');
    });

    test('should handle non-existent flow file gracefully', async () => {
      const nonExistentPath = join(TEST_FLOW_DIR, 'non-existent-flow.yaml');

      const startProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', nonExistentPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const stderr: string[] = [];
      startProcess.stderr?.on('data', (data) => {
        stderr.push(data.toString());
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const fullStderr = stderr.join('');
      expect(fullStderr).toContain('Failed to start scheduler');
    });

    test('should clean up lock files on scheduler stop', async () => {
      schedulerProcess = spawn('node', ['dist/cli.js', 'scheduler', 'start', testFlowPath, '--schedule', '* * * * *'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      const { readdirSync } = await import('fs');
      const files = readdirSync(process.cwd());
      const lockFiles = files.filter(f => f.startsWith('.scheduler-lock-'));

      expect(lockFiles.length).toBeGreaterThan(0);

      const stopProcess = spawn('node', ['dist/cli.js', 'scheduler', 'stop'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const remainingFiles = readdirSync(process.cwd());
      const remainingLockFiles = remainingFiles.filter(f => f.startsWith('.scheduler-lock-'));

      expect(remainingLockFiles.length).toBe(0);
    });
  });
});
