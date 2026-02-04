import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { rm } from 'fs/promises';

test.describe.configure({ mode: 'serial' });

const TEST_FLOW_DIR = join(process.cwd(), 'flows', 'test-flows');
const TEST_LOCK_FILE = '/tmp/automation.lock';

test.describe('Lock Concurrency Integration Tests', () => {
  let testFlowPath: string;

  test.beforeAll(async () => {
    if (!existsSync(TEST_FLOW_DIR)) {
      mkdirSync(TEST_FLOW_DIR, { recursive: true });
    }
  });

  test.afterAll(async () => {
    try {
      await rm(TEST_FLOW_DIR, { recursive: true, force: true });
      await rm(TEST_LOCK_FILE, { force: true });
    } catch {}
  });

  test.beforeEach(async () => {
    const flowContent = `
name: Test Concurrency Flow
description: Integration test flow for lock concurrency
url_prefix: https://example.com
steps:
  - step_no: 1
    action: wait
    target: "2000"
    description: Wait for lock test
    `.trim();

    testFlowPath = join(TEST_FLOW_DIR, `concurrency-flow-${Date.now()}.yaml`);
    writeFileSync(testFlowPath, flowContent);
  });

  test.afterEach(async () => {
    if (existsSync(testFlowPath)) {
      unlinkSync(testFlowPath);
    }
    try {
      await rm(TEST_LOCK_FILE, { force: true });
    } catch {}
  });

  test.describe('Concurrent execution prevention', () => {
    test('should prevent second execution while first is running', async () => {
      const lockData = {
        pid: process.pid,
        created_at: new Date().toISOString(),
        flow_file: testFlowPath,
        status: 'active'
      };
      writeFileSync(TEST_LOCK_FILE, JSON.stringify(lockData, null, 2));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const secondProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const secondStdout: string[] = [];
      const secondStderr: string[] = [];
      secondProcess.stdout?.on('data', (data) => secondStdout.push(data.toString()));
      secondProcess.stderr?.on('data', (data) => secondStderr.push(data.toString()));

      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (secondProcess.exitCode !== null) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      const secondOutput = (secondStdout.join('') + secondStderr.join(''));

      expect(secondOutput).toContain('Unable to acquire lock');

      expect(secondProcess.exitCode).toBe(5);
    });

    test('should allow new execution after first completes', async () => {
      const firstProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 500));
      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 3000));

      expect(existsSync(TEST_LOCK_FILE)).toBe(false);

      const secondProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 500));
      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 3000));
      expect(existsSync(TEST_LOCK_FILE)).toBe(false);
    });

    test('should clean up lock file even on execution failure', async () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'invalid-flow.yaml');
      writeFileSync(invalidFlowPath, `
name: Invalid Flow
description: Missing url_prefix
steps: []
      `.trim());

      try {
        spawn('node', ['dist/cli.js', 'run', invalidFlowPath, '--mode', 'manual'], {
          cwd: process.cwd(),
          stdio: 'pipe'
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }

      expect(existsSync(TEST_LOCK_FILE)).toBe(false);
    });
  });

  test.describe('Lock file integrity', () => {
    test('should maintain lock file with correct structure during execution', async () => {
      const cliProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const lockContent = readFileSync(TEST_LOCK_FILE, 'utf-8');
      const lock = JSON.parse(lockContent);

      expect(lock).toHaveProperty('pid');
      expect(lock).toHaveProperty('created_at');
      expect(lock).toHaveProperty('flow_file');
      expect(lock).toHaveProperty('status');
      expect(typeof lock.pid).toBe('number');
      expect(lock.flow_file).toBe(testFlowPath);
      expect(lock.status).toBe('active');

      await new Promise(resolve => setTimeout(resolve, 3000));
    });

    test('should handle corrupted lock file gracefully', async () => {
      writeFileSync(TEST_LOCK_FILE, 'corrupted invalid json {');

      const cliProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const stdout: string[] = [];
      const stderr: string[] = [];
      cliProcess.stdout?.on('data', (data) => stdout.push(data.toString()));
      cliProcess.stderr?.on('data', (data) => stderr.push(data.toString()));

      await new Promise(resolve => setTimeout(resolve, 500));

      const output = stdout.join('') + stderr.join('');

      expect(output).toContain('Corrupted lock file detected. Cleaning up...');

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const lockContent = readFileSync(TEST_LOCK_FILE, 'utf-8');
      const lock = JSON.parse(lockContent);

      expect(lock).toHaveProperty('pid');
      expect(lock).toHaveProperty('created_at');
      expect(lock).toHaveProperty('flow_file');
      expect(lock).toHaveProperty('status');
      expect(typeof lock.pid).toBe('number');

      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (cliProcess.exitCode !== null) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });
    });

    test('should clean up stale lock files (timeout)', async () => {
      const staleLock = {
        pid: 99999,
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        flow_file: testFlowPath,
        status: 'active'
      };
      writeFileSync(TEST_LOCK_FILE, JSON.stringify(staleLock, null, 2));

      const cliProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const lockContent = readFileSync(TEST_LOCK_FILE, 'utf-8');
      const lock = JSON.parse(lockContent);
      expect(lock.pid).not.toBe(99999);

      await new Promise(resolve => setTimeout(resolve, 3000));
    });
  });

  test.describe('Multiple concurrent attempts', () => {
    test('should reject all but first concurrent execution attempt', async () => {
      const lockData = {
        pid: process.pid,
        created_at: new Date().toISOString(),
        flow_file: testFlowPath,
        status: 'active'
      };
      writeFileSync(TEST_LOCK_FILE, JSON.stringify(lockData, null, 2));

      const processes: ReturnType<typeof spawn>[] = [];
      const outputs: string[] = [];
      const exitCodes: (number | null)[] = [];

      for (let i = 0; i < 3; i++) {
        const cliProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
          cwd: process.cwd(),
          stdio: 'pipe'
        });
        processes.push(cliProcess);

        const stdout: string[] = [];
        const stderr: string[] = [];
        cliProcess.stdout?.on('data', (data) => stdout.push(data.toString()));
        cliProcess.stderr?.on('data', (data) => stderr.push(data.toString()));

        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (cliProcess.exitCode !== null) {
              clearInterval(checkInterval);
              resolve(null);
            }
          }, 100);
        });

        outputs.push(stdout.join('') + stderr.join(''));
        exitCodes.push(cliProcess.exitCode);
      }

      const lockErrors = outputs.filter((output) => output.includes('Unable to acquire lock'));
      expect(lockErrors.length).toBe(3);

      const errorExitCodes = exitCodes.filter((code) => code === 5);
      expect(errorExitCodes.length).toBe(3);
    });
  });
});
