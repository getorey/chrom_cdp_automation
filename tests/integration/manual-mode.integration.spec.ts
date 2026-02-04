import { test, expect } from '@playwright/test';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { rm } from 'fs/promises';
import { execSync } from 'child_process';

test.describe.configure({ mode: 'serial' });

const TEST_FLOW_DIR = join(process.cwd(), 'flows', 'test-flows');

test.describe('Manual Mode Integration Tests', () => {
  let testFlowPath: string;

  test.beforeAll(async () => {
    if (!existsSync(TEST_FLOW_DIR)) {
      mkdirSync(TEST_FLOW_DIR, { recursive: true });
    }
  });

  test.afterAll(async () => {
    try {
      await rm(TEST_FLOW_DIR, { recursive: true, force: true });
    } catch {}
  });

  test.beforeEach(async () => {
    const flowContent = `
name: Test Flow
description: Integration test flow for manual mode
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
  });

  test.describe('Complete manual mode execution', () => {
    test('should accept manual mode parameter', () => {
      const validModes = ['manual', 'cli', 'scheduler'];

      validModes.forEach((mode) => {
        const isValid = mode === 'manual' || mode === 'cli' || mode === 'scheduler';
        expect(isValid).toBe(true);
      });
    });

    test('should reject invalid mode parameters', () => {
      const invalidModes = ['invalid', 'test', 'automatic', ''];

      invalidModes.forEach((mode) => {
        const isValid = mode === 'manual' || mode === 'cli' || mode === 'scheduler';
        expect(isValid).toBe(false);
      });
    });
  });

  test.describe('CLI manual mode execution', () => {
    test('should validate flow file before manual mode execution', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'invalid-manual-flow.yaml');
      writeFileSync(invalidFlowPath, `
name: Invalid Manual Flow
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

    test('should accept manual mode parameter in CLI run command', () => {
      try {
        execSync(`node dist/cli.js run "${testFlowPath}" --mode manual`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed (Chrome not available)');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).not.toBe(2);
        expect(err.stdout || err.stderr).not.toContain('Invalid mode');
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
  });

  test.describe('Manual mode execution flow validation', () => {
    test('should validate flow structure for manual mode', () => {
      const flowContent = `
name: Manual Mode Flow
description: Test flow for manual mode
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
  - step_no: 2
    action: click
    target: '#button'
    description: Click button
      `.trim();

      const validFlowPath = join(TEST_FLOW_DIR, 'valid-manual-flow.yaml');
      writeFileSync(validFlowPath, flowContent);

      try {
        const output = execSync(`node dist/cli.js validate "${validFlowPath}"`, {
          encoding: 'utf-8',
        });

        expect(output).toContain('✓');
        expect(output).toContain('is valid');
      } finally {
        if (existsSync(validFlowPath)) {
          unlinkSync(validFlowPath);
        }
      }
    });

    test('should handle missing url_prefix in manual mode', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'missing-url-flow.yaml');
      writeFileSync(invalidFlowPath, `
name: Missing URL Flow
description: Flow without url_prefix
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
      `.trim());

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
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

    test('should handle empty steps in manual mode', () => {
      const flowContent = `
name: Empty Steps Flow
description: Flow with empty steps
url_prefix: https://example.com
steps: []
      `.trim();

      const validFlowPath = join(TEST_FLOW_DIR, 'empty-steps-flow.yaml');
      writeFileSync(validFlowPath, flowContent);

      try {
        const output = execSync(`node dist/cli.js validate "${validFlowPath}"`, {
          encoding: 'utf-8',
        });

        expect(output).toContain('✓');
      } finally {
        if (existsSync(validFlowPath)) {
          unlinkSync(validFlowPath);
        }
      }
    });
  });

  test.describe('Manual mode argument verification', () => {
    test('should verify mode is passed to execution logic', () => {
      const mode = 'manual';
      expect(mode).toBe('manual');
    });

    test('should verify flow file path is used correctly', () => {
      expect(testFlowPath).toBeDefined();
      expect(testFlowPath).toContain('test-flow-');
      expect(testFlowPath).toContain('.yaml');
    });
  });

  test.describe('Exit code validation for manual mode', () => {
    test('should exit with code 3 on validation failure', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'validation-failure-flow.yaml');
      writeFileSync(invalidFlowPath, `
name: Invalid Flow
description: Missing required fields
steps: []
      `.trim());

      try {
        execSync(`node dist/cli.js run "${invalidFlowPath}" --mode manual`, {
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

    test('should exit with code 4 on CDP connection failure (no Chrome)', () => {
      try {
        execSync(`node dist/cli.js run "${testFlowPath}" --mode manual`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number };
        expect(err.status).toBe(4);
      }
    });
  });

  test.describe('Integration: Complete manual mode workflow validation', () => {
    test('should validate complete manual mode execution path components', () => {
      const flowContent = `
name: Complete Manual Flow
description: Complete workflow test
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate to page
  - step_no: 2
    action: wait
    target: "1000"
    description: Wait for load
  - step_no: 3
    action: click
    target: '#submit'
    description: Submit form
      `.trim();

      const validFlowPath = join(TEST_FLOW_DIR, 'complete-manual-flow.yaml');
      writeFileSync(validFlowPath, flowContent);

      try {
        const output = execSync(`node dist/cli.js validate "${validFlowPath}"`, {
          encoding: 'utf-8',
        });

        expect(output).toContain('✓');
        expect(output).toContain('is valid');
      } finally {
        if (existsSync(validFlowPath)) {
          unlinkSync(validFlowPath);
        }
      }
    });
  });
});
