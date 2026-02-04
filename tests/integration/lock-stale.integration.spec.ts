import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { rm } from 'fs/promises';

test.describe.configure({ mode: 'serial' });

const TEST_FLOW_DIR = join(process.cwd(), 'flows', 'test-flows');
const TEST_LOCK_FILE = '/tmp/automation.lock';

test.describe('Stale Lock Cleanup Integration Tests', () => {
  let testFlowPath: string;

  test.beforeAll(async () => {
    if (!existsSync(TEST_FLOW_DIR)) {
      mkdirSync(TEST_FLOW_DIR, { recursive: true });
    }
  });

  test.beforeEach(async () => {
    if (!existsSync(TEST_FLOW_DIR)) {
      mkdirSync(TEST_FLOW_DIR, { recursive: true });
    }

    const flowContent = `
name: Test Stale Lock Flow
description: Integration test flow for stale lock cleanup
url_prefix: https://example.com
steps:
  - step_no: 1
    action: wait
    target: "1000"
    description: Wait for stale lock test
    `.trim();

    testFlowPath = join(TEST_FLOW_DIR, `stale-lock-flow-${Date.now()}.yaml`);
    writeFileSync(testFlowPath, flowContent);
  });

  test.afterAll(async () => {
    try {
      await rm(TEST_FLOW_DIR, { recursive: true, force: true });
      await rm(TEST_LOCK_FILE, { force: true });
    } catch {}
  });

  test.afterEach(async () => {
    if (existsSync(testFlowPath)) {
      unlinkSync(testFlowPath);
    }
    try {
      await rm(TEST_LOCK_FILE, { force: true });
    } catch {}
  });

  test.describe('Stale lock timeout detection', () => {
    test('should clean up stale lock older than 5 minutes', async () => {
      const staleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const staleLock = {
        pid: 99999,
        created_at: staleTime,
        flow_file: testFlowPath,
        status: 'active'
      };
      writeFileSync(TEST_LOCK_FILE, JSON.stringify(staleLock, null, 2));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const cliProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const stdout: string[] = [];
      const stderr: string[] = [];
      cliProcess.stdout?.on('data', (data) => stdout.push(data.toString()));
      cliProcess.stderr?.on('data', (data) => stderr.push(data.toString()));

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const lockContent = readFileSync(TEST_LOCK_FILE, 'utf-8');
      const newLock = JSON.parse(lockContent);

      expect(newLock.pid).not.toBe(99999);
      expect(newLock.created_at).not.toBe(staleTime);
      expect(newLock.flow_file).toBe(testFlowPath);
      expect(newLock.status).toBe('active');

      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (cliProcess.exitCode !== null) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(existsSync(TEST_LOCK_FILE)).toBe(false);
    });

    test('should not clean up fresh lock (less than 5 minutes old)', async () => {
      const freshTime = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const freshLock = {
        pid: 99999,
        created_at: freshTime,
        flow_file: testFlowPath,
        status: 'active'
      };
      writeFileSync(TEST_LOCK_FILE, JSON.stringify(freshLock, null, 2));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const cliProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

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

      const output = stdout.join('') + stderr.join('');

      expect(output).toContain('Unable to acquire lock');
      expect(cliProcess.exitCode).toBe(5);
      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const lockContent = readFileSync(TEST_LOCK_FILE, 'utf-8');
      const lock = JSON.parse(lockContent);

      expect(lock.pid).toBe(99999);
      expect(lock.created_at).toBe(freshTime);
    });

    test('should clean up stale locks older than threshold', async () => {
      const staleTime = new Date(Date.now() - 5 * 60 * 1000 - 1000).toISOString();
      const staleLock = {
        pid: 99999,
        created_at: staleTime,
        flow_file: testFlowPath,
        status: 'active'
      };
      writeFileSync(TEST_LOCK_FILE, JSON.stringify(staleLock, null, 2));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

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

      const cdprFailed = output.includes('Failed to connect to Chrome via CDP');

      if (!cdprFailed) {
        expect(existsSync(TEST_LOCK_FILE)).toBe(true);

        const lockContent = readFileSync(TEST_LOCK_FILE, 'utf-8');
        const newLock = JSON.parse(lockContent);

        expect(newLock.pid).not.toBe(99999);
        expect(newLock.created_at).not.toBe(staleTime);
      }

      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (cliProcess.exitCode !== null) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(existsSync(TEST_LOCK_FILE)).toBe(false);
    });

    test('should handle stale lock with non-existent PID gracefully', async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const staleLock = {
        pid: 999999,
        created_at: staleTime,
        flow_file: testFlowPath,
        status: 'active'
      };
      writeFileSync(TEST_LOCK_FILE, JSON.stringify(staleLock, null, 2));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const cliProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const lockContent = readFileSync(TEST_LOCK_FILE, 'utf-8');
      const newLock = JSON.parse(lockContent);

      expect(newLock.pid).not.toBe(999999);
      expect(newLock.created_at).not.toBe(staleTime);

      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (cliProcess.exitCode !== null) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(existsSync(TEST_LOCK_FILE)).toBe(false);
    });
  });

  test.describe('Corrupted lock file with stale detection', () => {
    test('should treat corrupted lock file as stale and clean up', async () => {
      writeFileSync(TEST_LOCK_FILE, 'corrupted invalid json {');

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

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
      expect(lock.flow_file).toBe(testFlowPath);
      expect(lock.status).toBe('active');

      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (cliProcess.exitCode !== null) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(existsSync(TEST_LOCK_FILE)).toBe(false);
    });

    test('should handle lock file with missing required fields', async () => {
      const incompleteLock = {
        pid: 12345,
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString()
      };
      writeFileSync(TEST_LOCK_FILE, JSON.stringify(incompleteLock, null, 2));

      const cliProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      const stdout: string[] = [];
      const stderr: string[] = [];
      cliProcess.stdout?.on('data', (data) => stdout.push(data.toString()));
      cliProcess.stderr?.on('data', (data) => stderr.push(data.toString()));

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const lockContent = readFileSync(TEST_LOCK_FILE, 'utf-8');
      const newLock = JSON.parse(lockContent);

      expect(newLock).toHaveProperty('pid');
      expect(newLock).toHaveProperty('created_at');

      const cdprFailed = (stdout.join('') + stderr.join('')).includes('Failed to connect to Chrome via CDP');

      if (!cdprFailed) {
        expect(newLock).toHaveProperty('flow_file');
        expect(newLock).toHaveProperty('status');
      }

      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (cliProcess.exitCode !== null) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(existsSync(TEST_LOCK_FILE)).toBe(false);
    });

    test('should handle lock file with invalid created_at format', async () => {
      const invalidLock = {
        pid: 12345,
        created_at: 'not-a-valid-date',
        flow_file: testFlowPath,
        status: 'active'
      };
      writeFileSync(TEST_LOCK_FILE, JSON.stringify(invalidLock, null, 2));

      const cliProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const lockContent = readFileSync(TEST_LOCK_FILE, 'utf-8');
      const newLock = JSON.parse(lockContent);

      expect(newLock.created_at).not.toBe('not-a-valid-date');

      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (cliProcess.exitCode !== null) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(existsSync(TEST_LOCK_FILE)).toBe(false);
    });
  });

  test.describe('Edge cases for stale lock detection', () => {
    test('should handle very old stale lock (hours old)', async () => {
      const veryOldTime = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const veryOldLock = {
        pid: 11111,
        created_at: veryOldTime,
        flow_file: testFlowPath,
        status: 'active'
      };
      writeFileSync(TEST_LOCK_FILE, JSON.stringify(veryOldLock, null, 2));

      const cliProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const lockContent = readFileSync(TEST_LOCK_FILE, 'utf-8');
      const newLock = JSON.parse(lockContent);

      expect(newLock.pid).not.toBe(11111);
      expect(newLock.created_at).not.toBe(veryOldTime);

      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (cliProcess.exitCode !== null) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(existsSync(TEST_LOCK_FILE)).toBe(false);
    });

    test('should handle lock from different flow file', async () => {
      const otherFlowPath = join(TEST_FLOW_DIR, 'other-flow.yaml');
      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const staleLock = {
        pid: 22222,
        created_at: staleTime,
        flow_file: otherFlowPath,
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
      const newLock = JSON.parse(lockContent);

      expect(newLock.pid).not.toBe(22222);
      expect(newLock.created_at).not.toBe(staleTime);
      expect(newLock.flow_file).toBe(testFlowPath);

      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (cliProcess.exitCode !== null) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(existsSync(TEST_LOCK_FILE)).toBe(false);
    });

    test('should handle lock with non-active status', async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const staleLock = {
        pid: 33333,
        created_at: staleTime,
        flow_file: testFlowPath,
        status: 'completed'
      };
      writeFileSync(TEST_LOCK_FILE, JSON.stringify(staleLock, null, 2));

      const cliProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const lockContent = readFileSync(TEST_LOCK_FILE, 'utf-8');
      const newLock = JSON.parse(lockContent);

      expect(newLock.pid).not.toBe(33333);
      expect(newLock.created_at).not.toBe(staleTime);
      expect(newLock.status).toBe('active');

      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (cliProcess.exitCode !== null) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(existsSync(TEST_LOCK_FILE)).toBe(false);
    });
  });

  test.describe('Concurrent access after stale lock cleanup', () => {
    test('should allow multiple executions after stale lock is cleaned', async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const staleLock = {
        pid: 44444,
        created_at: staleTime,
        flow_file: testFlowPath,
        status: 'active'
      };
      writeFileSync(TEST_LOCK_FILE, JSON.stringify(staleLock, null, 2));

      const firstProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const secondProcess = spawn('node', ['dist/cli.js', 'run', testFlowPath, '--mode', 'manual'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(existsSync(TEST_LOCK_FILE)).toBe(true);

      const lockContent = readFileSync(TEST_LOCK_FILE, 'utf-8');
      const lock = JSON.parse(lockContent);

      expect(lock).toHaveProperty('pid');
      expect(lock.flow_file).toBe(testFlowPath);
      expect(lock.status).toBe('active');

      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (secondProcess.exitCode !== null) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(existsSync(TEST_LOCK_FILE)).toBe(false);
    });
  });
});
