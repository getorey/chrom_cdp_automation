import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { rm } from 'fs/promises';

test.describe.configure({ mode: 'serial' });

const TEST_FLOW_DIR = join(process.cwd(), 'flows', 'test-flows');
const TEST_LOCK_FILE = '/tmp/automation.lock';

test.describe('CLI Integration Tests', () => {
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
    if (!existsSync(TEST_FLOW_DIR)) {
      mkdirSync(TEST_FLOW_DIR, { recursive: true });
    }

    const flowContent = `
name: Test Flow
description: Integration test flow
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate to example
  - step_no: 2
    action: wait
    target: "1000"
    description: Wait for page load
    `.trim();

    testFlowPath = join(TEST_FLOW_DIR, `test-flow-${Date.now()}.yaml`);
    writeFileSync(testFlowPath, flowContent);
  });

  test.afterEach(async () => {
    if (existsSync(testFlowPath)) {
      unlinkSync(testFlowPath);
    }
    try {
      unlinkSync(TEST_LOCK_FILE);
    } catch {}
  });

  test.describe('validate command', () => {
    test('should validate a valid flow file successfully', () => {
      const output = execSync(`node dist/cli.js validate "${testFlowPath}"`, {
        encoding: 'utf-8',
      });

      expect(output).toContain('✓');
      expect(output).toContain('is valid');
    });

    test('should fail validation for invalid flow file', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'invalid-flow.yaml');
      writeFileSync(invalidFlowPath, `
name: Invalid Flow
description: Missing required fields
steps: []
    `.trim());

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('validation errors');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should report validation errors with path information', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'path-error-flow.yaml');
      writeFileSync(invalidFlowPath, `
name: Path Error Flow
description: Test path errors
url_prefix: https://example.com
steps:
  - step_no: 1
    action: invalid_action
    target: https://example.com
    description: Invalid action type
    `.trim());

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('/steps/0/action');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });
  });

  test.describe('check-cdp command', () => {
    test('should report error when Chrome not running on default port', () => {
      try {
        execSync('node dist/cli.js check-cdp --port 9999', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(5);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('Failed to connect');
      }
    });

    test('should show helpful error message with Chrome startup instructions', () => {
      try {
        execSync('node dist/cli.js check-cdp --port 9999', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        const output = err.stdout || err.stderr;
        expect(output).toContain('--remote-debugging-port');
      }
    });

    test('should fail with invalid port number', () => {
      try {
        execSync('node dist/cli.js check-cdp --port invalid', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(5);
        expect(err.stdout || err.stderr).toContain('Invalid port number');
      }
    });

    test('should use default port 9222 when not specified', () => {
      try {
        execSync('node dist/cli.js check-cdp', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(5);
      }
    });
  });

  test.describe('run command - manual mode', () => {
    test('should fail gracefully when Chrome CDP not available', () => {
      try {
        execSync(`node dist/cli.js run "${testFlowPath}" --mode manual`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(4);
        expect(err.stdout || err.stderr).toContain('✗');
      }
    });

    test('should validate flow file before execution', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'invalid-run-flow.yaml');
      writeFileSync(invalidFlowPath, `
name: Invalid Run Flow
description: Missing url_prefix
steps: []
    `.trim());

      try {
        execSync(`node dist/cli.js run "${invalidFlowPath}" --mode manual`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('validation errors');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should reject invalid mode parameter', () => {
      try {
        execSync(`node dist/cli.js run "${testFlowPath}" --mode invalid`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(2);
        expect(err.stdout || err.stderr).toContain('Invalid mode');
        expect(err.stdout || err.stderr).toContain('manual, cli, scheduler');
      }
    });

    test('should accept all valid mode parameters', () => {
      const validModes = ['manual', 'cli', 'scheduler'];

      validModes.forEach((mode) => {
        try {
          execSync(`node dist/cli.js run "${testFlowPath}" --mode ${mode}`, {
            encoding: 'utf-8',
          });
          throw new Error('Command should have failed (Chrome not available)');
        } catch (error: unknown) {
          const err = error as { status?: number; stdout?: string; stderr?: string };
          expect(err.status).not.toBe(2);
          expect(err.stdout || err.stderr).not.toContain('Invalid mode');
        }
      });
    });
  });

  test.describe('status command', () => {
    test('should report no active session when lock file does not exist', () => {
      if (existsSync(TEST_LOCK_FILE)) {
        unlinkSync(TEST_LOCK_FILE);
      }

      const output = execSync('node dist/cli.js status', {
        encoding: 'utf-8',
      });

      expect(output).toContain('No active automation session');
    });

    test('should report active session when lock file exists', () => {
      const lockContent = JSON.stringify({
        pid: 12345,
        created_at: new Date().toISOString(),
        flow_file: testFlowPath,
        status: 'running'
      });
      writeFileSync(TEST_LOCK_FILE, lockContent);

      try {
        const output = execSync('node dist/cli.js status', {
          encoding: 'utf-8',
        });

        expect(output).toContain('Active automation session:');
        expect(output).toContain('PID: 12345');
        expect(output).toContain('Status: running');
      } finally {
        unlinkSync(TEST_LOCK_FILE);
      }
    });

    test('should handle corrupted lock file gracefully', () => {
      writeFileSync(TEST_LOCK_FILE, 'corrupted data {invalid json');

      try {
        execSync('node dist/cli.js status', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(5);
        expect(err.stdout || err.stderr).toContain('Corrupted lock file');
      } finally {
        unlinkSync(TEST_LOCK_FILE);
      }
    });

    test('should display all lock file fields correctly', () => {
      const lockData = {
        pid: 99999,
        created_at: '2025-01-15T10:30:00.000Z',
        flow_file: testFlowPath,
        status: 'running'
      };
      writeFileSync(TEST_LOCK_FILE, JSON.stringify(lockData));

      try {
        const output = execSync('node dist/cli.js status', {
          encoding: 'utf-8',
        });

        expect(output).toContain('PID: 99999');
        expect(output).toContain(`Flow file: ${testFlowPath}`);
        expect(output).toContain('Status: running');
        expect(output).toContain('Created at: 2025-01-15T10:30:00.000Z');
      } finally {
        unlinkSync(TEST_LOCK_FILE);
      }
    });
  });

  test.describe('Integration: Full workflow with lock file', () => {
    test('should create lock file during run attempt and clean up on failure', () => {
      if (existsSync(TEST_LOCK_FILE)) {
        unlinkSync(TEST_LOCK_FILE);
      }

      try {
        execSync(`node dist/cli.js run "${testFlowPath}" --mode manual`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(4);
        expect(existsSync(TEST_LOCK_FILE)).toBe(false);
      }
    });
  });

  test.describe('Error handling and exit codes', () => {
    test('should exit with code 1 for unknown commands (usage error)', () => {
      try {
        execSync('node dist/cli.js invalid-command', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number };
        expect(err.status).toBe(1);
      }
    });

    test('should exit with code 3 for configuration errors', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'config-error-flow.yaml');
      writeFileSync(invalidFlowPath, 'invalid: yaml: content');

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number };
        expect(err.status).toBe(3);
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should exit with code 4 for system errors', () => {
      const nonExistentFlowPath = join(TEST_FLOW_DIR, 'non-existent.yaml');

      try {
        execSync(`node dist/cli.js run "${nonExistentFlowPath}" --mode manual`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number };
        expect(err.status).toBe(4);
      }
    });

    test('should exit with code 5 for conflict errors (CDP connection)', () => {
      try {
        execSync('node dist/cli.js check-cdp --port 9999', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number };
        expect(err.status).toBe(5);
      }
    });
  });
});
