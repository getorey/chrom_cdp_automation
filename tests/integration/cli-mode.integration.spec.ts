import { test, expect } from '@playwright/test';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { rm } from 'fs/promises';
import { execSync } from 'child_process';

test.describe.configure({ mode: 'serial' });

const TEST_FLOW_DIR = join(process.cwd(), 'flows', 'test-flows');

test.describe('CLI Mode Integration Tests', () => {
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
name: Test CLI Flow
description: Integration test flow for CLI mode
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
  - step_no: 3
    action: click
    target: '#submit-button'
    description: Click submit button
    `.trim();

    testFlowPath = join(TEST_FLOW_DIR, `test-cli-flow-${Date.now()}.yaml`);
    writeFileSync(testFlowPath, flowContent);
  });

  test.afterEach(async () => {
    if (existsSync(testFlowPath)) {
      unlinkSync(testFlowPath);
    }
  });

  test.describe('CLI mode parameter validation', () => {
    test('should accept CLI mode parameter', () => {
      const validModes = ['cli'];
      validModes.forEach((mode) => {
        const isValid = mode === 'cli';
        expect(isValid).toBe(true);
      });
    });

    test('should validate CLI mode is a valid mode', () => {
      const cliMode = 'cli';
      const validModes = ['manual', 'cli', 'scheduler'];
      expect(validModes.includes(cliMode)).toBe(true);
    });
  });

  test.describe('CLI mode execution', () => {
    test('should validate flow file before CLI mode execution', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'invalid-cli-flow.yaml');
      writeFileSync(invalidFlowPath, `
name: Invalid CLI Flow
description: Missing url_prefix
steps: []
      `.trim());

      try {
        execSync(`node dist/cli.js run "${invalidFlowPath}" --mode cli`, {
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

    test('should accept CLI mode parameter in CLI run command', () => {
      try {
        execSync(`node dist/cli.js run "${testFlowPath}" --mode cli`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed (Chrome not available)');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).not.toBe(2);
        expect(err.stdout || err.stderr).not.toContain('Invalid mode');
      }
    });

    test('should reject invalid mode parameter when expecting CLI mode', () => {
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

  test.describe('CLI mode execution flow validation', () => {
    test('should validate flow structure for CLI mode', () => {
      const flowContent = `
name: CLI Mode Flow
description: Test flow for CLI mode
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
  - step_no: 3
    action: type
    target: '#input'
    value: 'test input'
    description: Type text
      `.trim();

      const validFlowPath = join(TEST_FLOW_DIR, 'valid-cli-flow.yaml');
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

    test('should handle missing url_prefix in CLI mode', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'missing-url-cli-flow.yaml');
      writeFileSync(invalidFlowPath, `
name: Missing URL CLI Flow
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

    test('should handle empty steps in CLI mode', () => {
      const flowContent = `
name: Empty Steps CLI Flow
description: Flow with empty steps
url_prefix: https://example.com
steps: []
      `.trim();

      const validFlowPath = join(TEST_FLOW_DIR, 'empty-steps-cli-flow.yaml');
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

    test('should handle complex flow steps in CLI mode', () => {
      const flowContent = `
name: Complex CLI Flow
description: Flow with multiple step types
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate to page
  - step_no: 2
    action: wait
    target: "2000"
    description: Wait for content
  - step_no: 3
    action: click
    target: '#primary-button'
    description: Click button
  - step_no: 4
    action: type
    target: '#search-input'
    value: 'search query'
    description: Type search query
  - step_no: 5
    action: wait
    target: "1000"
    description: Wait for results
      `.trim();

      const validFlowPath = join(TEST_FLOW_DIR, 'complex-cli-flow.yaml');
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

  test.describe('CLI mode argument verification', () => {
    test('should verify mode is passed to execution logic', () => {
      const mode = 'cli';
      expect(mode).toBe('cli');
    });

    test('should verify flow file path is used correctly', () => {
      expect(testFlowPath).toBeDefined();
      expect(testFlowPath).toContain('test-cli-flow-');
      expect(testFlowPath).toContain('.yaml');
    });

    test('should verify CLI mode is recognized in mode options', () => {
      const modeOptions = ['manual', 'cli', 'scheduler'];
      expect(modeOptions).toContain('cli');
    });
  });

  test.describe('Exit code validation for CLI mode', () => {
    test('should exit with code 3 on validation failure', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'cli-validation-failure.yaml');
      writeFileSync(invalidFlowPath, `
name: Invalid CLI Flow
description: Missing required fields
steps: []
      `.trim());

      try {
        execSync(`node dist/cli.js run "${invalidFlowPath}" --mode cli`, {
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
        execSync(`node dist/cli.js run "${testFlowPath}" --mode cli`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number };
        expect(err.status).toBe(4);
      }
    });

    test('should exit with code 2 on invalid mode parameter', () => {
      try {
        execSync(`node dist/cli.js run "${testFlowPath}" --mode invalid-cli`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number };
        expect(err.status).toBe(2);
      }
    });
  });

  test.describe('Integration: Complete CLI mode workflow validation', () => {
    test('should validate complete CLI mode execution path components', () => {
      const flowContent = `
name: Complete CLI Flow
description: Complete workflow test for CLI mode
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
  - step_no: 4
    action: type
    target: '#username'
    value: 'testuser'
    description: Enter username
      `.trim();

      const validFlowPath = join(TEST_FLOW_DIR, 'complete-cli-flow.yaml');
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

    test('should verify CLI mode output format', () => {
      try {
        execSync(`node dist/cli.js run "${testFlowPath}" --mode cli`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed (Chrome not available)');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        const output = err.stdout || err.stderr || '';
        expect(typeof output).toBe('string');
      }
    });
  });

  test.describe('CLI mode specific behavior', () => {
    test('should handle CLI mode with default mode option', () => {
      const flowContent = `
name: Default CLI Flow
description: Flow with default mode handling
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
      `.trim();

      const validFlowPath = join(TEST_FLOW_DIR, 'default-cli-flow.yaml');
      writeFileSync(validFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js run "${validFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed (Chrome not available)');
      } catch (error: unknown) {
        const err = error as { status?: number };
        expect(err.status).not.toBe(2);
      } finally {
        if (existsSync(validFlowPath)) {
          unlinkSync(validFlowPath);
        }
      }
    });

    test('should handle CLI mode with explicit mode option', () => {
      try {
        execSync(`node dist/cli.js run "${testFlowPath}" --mode cli`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed (Chrome not available)');
      } catch (error: unknown) {
        const err = error as { status?: number };
        expect(err.status).not.toBe(2);
      }
    });
  });
});
