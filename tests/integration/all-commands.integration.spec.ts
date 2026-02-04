import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe.configure({ mode: 'serial' });

test.describe('All CLI Commands Tests', () => {
  test('--help displays usage information', () => {
    const output = execSync('node dist/cli.js --help', {
      encoding: 'utf-8',
    });

    expect(output).toContain('chrome-cdp');
    expect(output).toContain('Chrome DevTools Protocol automation runner');
    expect(output).toContain('run');
    expect(output).toContain('validate');
    expect(output).toContain('schedule');
    expect(output).toContain('scheduler');
    expect(output).toContain('check-cdp');
    expect(output).toContain('status');
    expect(output).toContain('flow');
  });

  test('--version displays version', () => {
    const output = execSync('node dist/cli.js --version', {
      encoding: 'utf-8',
    });

    expect(output.trim()).toBe('1.0.0');
  });

  test('unknown command returns exit code 1', () => {
    try {
      execSync('node dist/cli.js unknown-command', {
        encoding: 'utf-8',
      });
      throw new Error('Command should have failed');
    } catch (error: unknown) {
      const err = error as { status?: number; stdout?: string; stderr?: string };
      expect(err.status).toBe(1);
      expect(err.stdout || err.stderr).toContain('error: unknown command');
    }
  });

  test('invalid subcommand returns exit code 1', () => {
    try {
      execSync('node dist/cli.js scheduler invalid-subcommand', {
        encoding: 'utf-8',
      });
      throw new Error('Command should have failed');
    } catch (error: unknown) {
      const err = error as { status?: number; stdout?: string; stderr?: string };
      expect(err.status).toBe(1);
      expect(err.stdout || err.stderr).toContain('error: unknown command');
    }
  });

  test('missing arguments returns exit code 1', () => {
    try {
      execSync('node dist/cli.js run', {
        encoding: 'utf-8',
      });
      throw new Error('Command should have failed');
    } catch (error: unknown) {
      const err = error as { status?: number; stdout?: string; stderr?: string };
      expect(err.status).toBe(1);
      expect(err.stdout || err.stderr).toContain('error: missing required argument');
    }
  });
});
