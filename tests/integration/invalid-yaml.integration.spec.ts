import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { rm } from 'fs/promises';

test.describe.configure({ mode: 'serial' });

const TEST_FLOW_DIR = join(process.cwd(), 'flows', 'test-invalid-yaml');

test.describe('Invalid YAML Validation Tests', () => {
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

  test.describe('Missing top-level fields', () => {
    test('should fail validation when name field is missing', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'missing-name.yaml');
      const flowContent = `
description: Missing name field
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate to example
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

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
        expect(err.stdout || err.stderr).toContain('name');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation when description field is missing', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'missing-description.yaml');
      const flowContent = `
name: Missing Description Flow
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate to example
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

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
        expect(err.stdout || err.stderr).toContain('description');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation when url_prefix field is missing', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'missing-url-prefix.yaml');
      const flowContent = `
name: Missing URL Prefix Flow
description: Missing url_prefix field
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate to example
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

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
        expect(err.stdout || err.stderr).toContain('url_prefix');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation when steps field is missing', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'missing-steps.yaml');
      const flowContent = `
name: Missing Steps Flow
description: Missing steps field
url_prefix: https://example.com
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

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
        expect(err.stdout || err.stderr).toContain('steps');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation when all top-level fields are missing', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'empty.yaml');
      writeFileSync(invalidFlowPath, '');

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });
  });

  test.describe('Missing step fields', () => {
    test('should fail validation when step_no field is missing', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'missing-step-no.yaml');
      const flowContent = `
name: Missing Step No Flow
description: Missing step_no field in step
url_prefix: https://example.com
steps:
  - action: navigate
    target: https://example.com
    description: Navigate to example
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('step_no');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation when action field is missing', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'missing-action.yaml');
      const flowContent = `
name: Missing Action Flow
description: Missing action field in step
url_prefix: https://example.com
steps:
  - step_no: 1
    target: https://example.com
    description: Navigate to example
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('action');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation when target field is missing', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'missing-target.yaml');
      const flowContent = `
name: Missing Target Flow
description: Missing target field in step
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    description: Navigate to example
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('target');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation when description field is missing', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'missing-step-description.yaml');
      const flowContent = `
name: Missing Step Description Flow
description: Missing description field in step
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('description');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });
  });

  test.describe('Invalid action type', () => {
    test('should fail validation for invalid action type', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'invalid-action.yaml');
      const flowContent = `
name: Invalid Action Flow
description: Invalid action type
url_prefix: https://example.com
steps:
  - step_no: 1
    action: invalid_action
    target: https://example.com
    description: Invalid action
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('action');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation for action with wrong case', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'wrong-case-action.yaml');
      const flowContent = `
name: Wrong Case Action Flow
description: Action with wrong case
url_prefix: https://example.com
steps:
  - step_no: 1
    action: NAVIGATE
    target: https://example.com
    description: Navigate to example
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('action');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation for action with number type', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'number-action.yaml');
      const flowContent = `
name: Number Action Flow
description: Action as number
url_prefix: https://example.com
steps:
  - step_no: 1
    action: 123
    target: https://example.com
    description: Navigate to example
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });
  });

  test.describe('Malformed YAML syntax', () => {
    test('should fail validation for malformed YAML with bad indentation', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'malformed-yaml.yaml');
      const flowContent = `name: Malformed YAML
description: Invalid YAML syntax
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
      invalid_indent: wrong level`;

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('Error reading or parsing flow file');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation for invalid colon placement', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'invalid-colon.yaml');
      writeFileSync(invalidFlowPath, 'name: Test : invalid colon');

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('Error reading or parsing flow file');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation for mixed tabs and spaces', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'mixed-tabs-spaces.yaml');
      const flowContent = 'name: Test\n\t description: Mixed tabs and spaces';

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('Error reading or parsing flow file');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });
  });

  test.describe('Wrong data types', () => {
    test('should fail validation when name is number instead of string', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'number-name.yaml');
      const flowContent = `
name: 123
description: Name as number
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('name');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation when description is boolean instead of string', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'boolean-description.yaml');
      const flowContent = `
name: Boolean Description Flow
description: false
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('description');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation when steps is not an array', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'not-array-steps.yaml');
      const flowContent = `
name: Not Array Steps Flow
description: Steps as string
url_prefix: https://example.com
steps: "not an array"
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('steps');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation when step_no is string instead of number', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'string-step-no.yaml');
      const flowContent = `
name: String Step No Flow
description: step_no as string
url_prefix: https://example.com
steps:
  - step_no: "1"
    action: navigate
    target: https://example.com
    description: Navigate
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('step_no');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should fail validation when timeout is string instead of number', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'string-timeout.yaml');
      const flowContent = `
name: String Timeout Flow
description: timeout as string
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
    timeout: "5000"
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('timeout');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });
  });

  test.describe('Empty fields', () => {
    test('should pass validation when name is empty string (schema allows it)', () => {
      const flowPath = join(TEST_FLOW_DIR, 'empty-name.yaml');
      const flowContent = `
name: ""
description: Empty name
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
      `.trim();

      writeFileSync(flowPath, flowContent);

      try {
        const output = execSync(`node dist/cli.js validate "${flowPath}"`, {
          encoding: 'utf-8',
        });
        expect(output).toContain('✓');
        expect(output).toContain('is valid');
      } finally {
        if (existsSync(flowPath)) {
          unlinkSync(flowPath);
        }
      }
    });

    test('should pass validation when description is empty string (schema allows it)', () => {
      const flowPath = join(TEST_FLOW_DIR, 'empty-description.yaml');
      const flowContent = `
name: Empty Description Flow
description: ""
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
      `.trim();

      writeFileSync(flowPath, flowContent);

      try {
        const output = execSync(`node dist/cli.js validate "${flowPath}"`, {
          encoding: 'utf-8',
        });
        expect(output).toContain('✓');
        expect(output).toContain('is valid');
      } finally {
        if (existsSync(flowPath)) {
          unlinkSync(flowPath);
        }
      }
    });

    test('should pass validation when url_prefix is empty string (schema allows it)', () => {
      const flowPath = join(TEST_FLOW_DIR, 'empty-url-prefix.yaml');
      const flowContent = `
name: Empty URL Prefix Flow
description: Empty url_prefix
url_prefix: ""
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
      `.trim();

      writeFileSync(flowPath, flowContent);

      try {
        const output = execSync(`node dist/cli.js validate "${flowPath}"`, {
          encoding: 'utf-8',
        });
        expect(output).toContain('✓');
        expect(output).toContain('is valid');
      } finally {
        if (existsSync(flowPath)) {
          unlinkSync(flowPath);
        }
      }
    });

    test('should pass validation when target is empty string (schema allows it)', () => {
      const flowPath = join(TEST_FLOW_DIR, 'empty-target.yaml');
      const flowContent = `
name: Empty Target Flow
description: Empty target in step
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: ""
    description: Navigate
      `.trim();

      writeFileSync(flowPath, flowContent);

      try {
        const output = execSync(`node dist/cli.js validate "${flowPath}"`, {
          encoding: 'utf-8',
        });
        expect(output).toContain('✓');
        expect(output).toContain('is valid');
      } finally {
        if (existsSync(flowPath)) {
          unlinkSync(flowPath);
        }
      }
    });
  });

  test.describe('Error message quality', () => {
    test('should provide useful error message for missing required field', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'error-message-test.yaml');
      const flowContent = `
name: Error Message Test
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        const output = err.stdout || err.stderr;
        expect(err.status).toBe(3);
        expect(output).toContain('✗');
        expect(output).toContain('validation errors');
        expect(output).toContain('description');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });

    test('should include path information for validation errors', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'path-info-test.yaml');
      const flowContent = `
name: Path Info Test
description: Test path info
url_prefix: https://example.com
steps:
  - step_no: 1
    action: invalid
    target: https://example.com
    description: Navigate
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        const output = err.stdout || err.stderr;
        expect(err.status).toBe(3);
        expect(output).toContain('✗');
        expect(output).toContain('path:');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });
  });

  test.describe('Multiple validation errors', () => {
    test('should report all validation errors at once', () => {
      const invalidFlowPath = join(TEST_FLOW_DIR, 'multiple-errors.yaml');
      const flowContent = `
description: Multiple errors
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
  - step_no: 2
    description: Missing action and target
      `.trim();

      writeFileSync(invalidFlowPath, flowContent);

      try {
        execSync(`node dist/cli.js validate "${invalidFlowPath}"`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        const output = err.stdout || err.stderr;
        expect(err.status).toBe(3);
        expect(output).toContain('✗');
        expect(output).toContain('validation errors');
        expect(output).toContain('name');
        expect(output).toContain('action');
        expect(output).toContain('target');
      } finally {
        if (existsSync(invalidFlowPath)) {
          unlinkSync(invalidFlowPath);
        }
      }
    });
  });
});
