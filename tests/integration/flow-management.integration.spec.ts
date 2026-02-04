import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

test.describe.configure({ mode: 'serial' });

const TEMP_DIR = join(tmpdir(), `chrome-cdp-flow-test-${randomUUID()}`);
const TEMP_FLOWS_DIR = join(TEMP_DIR, 'flows');

test.describe('Flow Management Integration Tests', () => {
  let testFlowPath: string;
  let originalCwd: string;

  test.beforeAll(async () => {
    originalCwd = process.cwd();
    mkdirSync(TEMP_DIR, { recursive: true });
    mkdirSync(TEMP_FLOWS_DIR, { recursive: true });
    process.chdir(TEMP_DIR);
  });

  test.afterAll(async () => {
    process.chdir(originalCwd);
    try {
      rmSync(TEMP_DIR, { recursive: true, force: true });
    } catch {}
  });

  test.beforeEach(async () => {
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

    testFlowPath = join(TEMP_DIR, `test-flow-${randomUUID()}.yaml`);
    writeFileSync(testFlowPath, flowContent);
  });

  test.afterEach(async () => {
    if (existsSync(testFlowPath)) {
      unlinkSync(testFlowPath);
    }
    const registryPath = join(TEMP_FLOWS_DIR, 'registry.json');
    if (existsSync(registryPath)) {
      unlinkSync(registryPath);
    }
    const flowFiles = readdirSync(TEMP_FLOWS_DIR).filter((f: string) => f.endsWith('.yaml'));
    flowFiles.forEach((file: string) => {
      unlinkSync(join(TEMP_FLOWS_DIR, file));
    });
  });

  test.describe('flow register command', () => {
    test('should register a flow and add file to flows directory', () => {
      const output = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${testFlowPath}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(output).toContain('✓');
      expect(output).toContain('registered successfully');
      expect(output).toContain('Flow ID:');

      const registryPath = join(TEMP_FLOWS_DIR, 'registry.json');
      expect(existsSync(registryPath)).toBe(true);

      const registryContent = readFileSync(registryPath, 'utf-8');
      const registry = JSON.parse(registryContent);
      expect(registry).toHaveLength(1);
      expect(registry[0].name).toBe('Test Flow');
      expect(registry[0].id).toMatch(/^[a-f0-9-]{36}$/);

      const flowFilePath = join(TEMP_FLOWS_DIR, `${registry[0].id}.yaml`);
      expect(existsSync(flowFilePath)).toBe(true);
    });

    test('should add entry to registry with correct metadata', () => {
      const output = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${testFlowPath}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      const registryPath = join(TEMP_FLOWS_DIR, 'registry.json');
      const registryContent = readFileSync(registryPath, 'utf-8');
      const registry = JSON.parse(registryContent);

      expect(registry[0]).toHaveProperty('id');
      expect(registry[0]).toHaveProperty('name', 'Test Flow');
      expect(registry[0]).toHaveProperty('description', 'Integration test flow');
      expect(registry[0]).toHaveProperty('originalPath');
      expect(registry[0]).toHaveProperty('registeredAt');
      expect(registry[0].originalPath).toContain(testFlowPath);
      expect(registry[0].registeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('should fail when flow file does not exist', () => {
      const nonExistentPath = join(TEMP_DIR, 'non-existent.yaml');

      try {
        execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${nonExistentPath}"`, {
          encoding: 'utf-8',
          cwd: TEMP_DIR,
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('Flow file not found');
      }
    });

    test('should fail validation for invalid flow file', () => {
      const invalidFlowPath = join(TEMP_DIR, 'invalid-flow.yaml');
      writeFileSync(invalidFlowPath, `
name: Invalid Flow
description: Missing url_prefix
steps: []
      `.trim());

      try {
        execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${invalidFlowPath}"`, {
          encoding: 'utf-8',
          cwd: TEMP_DIR,
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
      const invalidFlowPath = join(TEMP_DIR, 'path-error-flow.yaml');
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
        execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${invalidFlowPath}"`, {
          encoding: 'utf-8',
          cwd: TEMP_DIR,
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

  test.describe('flow list command', () => {
    test('should list registered flow in table format', () => {
      const registerOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${testFlowPath}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      const listOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow list`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(listOutput).toContain('ID');
      expect(listOutput).toContain('Name');
      expect(listOutput).toContain('Description');
      expect(listOutput).toContain('Registered');
      expect(listOutput).toContain('Test Flow');
      expect(listOutput).toContain('Integration test flow');
    });

    test('should display all flows when multiple registered', () => {
      const flow2Path = join(TEMP_DIR, `test-flow-2-${randomUUID()}.yaml`);
      writeFileSync(flow2Path, `
name: Test Flow 2
description: Second integration test flow
url_prefix: https://example2.com
steps:
  - step_no: 1
    action: navigate
    target: https://example2.com
    description: Navigate to example2
      `.trim());

      execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${testFlowPath}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${flow2Path}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      const listOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow list`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(listOutput).toContain('Test Flow');
      expect(listOutput).toContain('Test Flow 2');
      expect(listOutput).toContain('Integration test flow');
      expect(listOutput).toContain('Second integration test flow');

      unlinkSync(flow2Path);
    });

    test('should show message when no flows registered', () => {
      const listOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow list`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(listOutput).toContain('No flows registered yet');
      expect(listOutput).toContain('Use "chrome-cdp flow register <flow-file>" to register a flow.');
    });

    test('should display table format correctly', () => {
      execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${testFlowPath}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      const listOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow list`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(listOutput).toContain('┌─');
      expect(listOutput).toContain('│');
      expect(listOutput).toContain('└─');
    });
  });

  test.describe('flow delete command', () => {
    test('should delete flow and remove file from flows directory', () => {
      const registerOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${testFlowPath}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      const flowIdMatch = registerOutput.match(/Flow ID: ([a-f0-9-]{36})/);
      const flowId = flowIdMatch ? flowIdMatch[1] : '';

      expect(flowId).toBeTruthy();

      const deleteOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow delete "${flowId}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(deleteOutput).toContain('✓');
      expect(deleteOutput).toContain('deleted successfully');
      expect(deleteOutput).toContain(flowId);

      const flowFilePath = join(TEMP_FLOWS_DIR, `${flowId}.yaml`);
      expect(existsSync(flowFilePath)).toBe(false);

      const registryPath = join(TEMP_FLOWS_DIR, 'registry.json');
      const registryContent = readFileSync(registryPath, 'utf-8');
      const registry = JSON.parse(registryContent);
      expect(registry).toHaveLength(0);
    });

    test('should remove entry from registry', () => {
      const registerOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${testFlowPath}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      const flowIdMatch = registerOutput.match(/Flow ID: ([a-f0-9-]{36})/);
      const flowId = flowIdMatch ? flowIdMatch[1] : '';

      execSync(`node ${join(originalCwd, 'dist/cli.js')} flow delete "${flowId}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      const registryPath = join(TEMP_FLOWS_DIR, 'registry.json');
      const registryContent = readFileSync(registryPath, 'utf-8');
      const registry = JSON.parse(registryContent);

      expect(registry).toHaveLength(0);
    });

    test('should fail when flow does not exist', () => {
      execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${testFlowPath}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      const nonExistentFlowId = randomUUID();

      try {
        execSync(`node ${join(originalCwd, 'dist/cli.js')} flow delete "${nonExistentFlowId}"`, {
          encoding: 'utf-8',
          cwd: TEMP_DIR,
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('not found');
      }
    });

    test('should fail when no flows registered', () => {
      const nonExistentFlowId = randomUUID();

      try {
        execSync(`node ${join(originalCwd, 'dist/cli.js')} flow delete "${nonExistentFlowId}"`, {
          encoding: 'utf-8',
          cwd: TEMP_DIR,
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        expect(err.status).toBe(3);
        expect(err.stdout || err.stderr).toContain('✗');
        expect(err.stdout || err.stderr).toContain('No flows registered yet');
      }
    });

    test('should display flow name in delete confirmation', () => {
      const registerOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${testFlowPath}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      const flowIdMatch = registerOutput.match(/Flow ID: ([a-f0-9-]{36})/);
      const flowId = flowIdMatch ? flowIdMatch[1] : '';

      const deleteOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow delete "${flowId}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(deleteOutput).toContain('Test Flow');
    });
  });

  test.describe('Integration: Full flow management workflow', () => {
    test('should register, list, and delete flow correctly', () => {
      const registerOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${testFlowPath}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(registerOutput).toContain('registered successfully');
      const flowIdMatch = registerOutput.match(/Flow ID: ([a-f0-9-]{36})/);
      const flowId = flowIdMatch ? flowIdMatch[1] : '';

      const listOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow list`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(listOutput).toContain('Test Flow');
      expect(listOutput).toContain(flowId);

      const deleteOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow delete "${flowId}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(deleteOutput).toContain('deleted successfully');

      const listAfterDelete = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow list`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(listAfterDelete).not.toContain('Test Flow');
      expect(listAfterDelete).toContain('No flows registered yet');
    });

    test('should handle multiple flows registration and deletion', () => {
      const flowIds: string[] = [];

      for (let i = 0; i < 3; i++) {
        const flowPath = join(TEMP_DIR, `test-flow-${i}-${randomUUID()}.yaml`);
        writeFileSync(flowPath, `
name: Test Flow ${i}
description: Integration test flow ${i}
url_prefix: https://example${i}.com
steps:
  - step_no: 1
    action: navigate
    target: https://example${i}.com
    description: Navigate to example${i}
        `.trim());

        const registerOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow register "${flowPath}"`, {
          encoding: 'utf-8',
          cwd: TEMP_DIR,
        });

        const flowIdMatch = registerOutput.match(/Flow ID: ([a-f0-9-]{36})/);
        if (flowIdMatch) {
          flowIds.push(flowIdMatch[1]);
        }

        unlinkSync(flowPath);
      }

      const listOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow list`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(listOutput).toContain('Test Flow 0');
      expect(listOutput).toContain('Test Flow 1');
      expect(listOutput).toContain('Test Flow 2');

      const deleteOutput = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow delete "${flowIds[0]}"`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(deleteOutput).toContain('Test Flow 0');
      expect(deleteOutput).toContain('deleted successfully');

      const listAfterDelete = execSync(`node ${join(originalCwd, 'dist/cli.js')} flow list`, {
        encoding: 'utf-8',
        cwd: TEMP_DIR,
      });

      expect(listAfterDelete).not.toContain('Test Flow 0');
      expect(listAfterDelete).toContain('Test Flow 1');
      expect(listAfterDelete).toContain('Test Flow 2');
    });
  });
});
