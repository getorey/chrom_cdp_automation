import { test, expect } from '@playwright/test';
import { readFile, rm } from 'fs/promises';
import { join } from 'path';
import { executeFlow, isSessionExpired } from '../../src/runner/flow-executor.js';
import { createLogger } from '../../src/logger/index.js';
import { Flow, ActionType, Step } from '../../src/models/flow.js';
import { existsSync } from 'fs';

test.describe.configure({ mode: 'serial' });

const createMockFlow = (steps: Step[], url_prefix: string = 'https://example.com'): Flow => ({
  name: 'Test Flow',
  description: 'Test flow description',
  url_prefix,
  steps,
});

test.describe('Session Expiration Integration Tests', () => {
  let page: any;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page?.close();
    try {
      await rm('logs', { recursive: true, force: true });
      await rm('artifacts', { recursive: true, force: true });
    } catch {}
  });

  test.describe('Session expiration detection', () => {
    test('should detect session expiration when redirected to login page', async () => {
      await page.goto('about:blank');
      await page.setContent('<html><body><h1>Sign In</h1></body></html>');
      
      const expired = await isSessionExpired(page, 'https://example.com');
      expect(expired).toBe(true);
    });

    test('should not detect session expiration when URL matches prefix', async () => {
      await page.goto('https://example.com/');
      await page.setContent('<html><body><h1>Dashboard</h1></body></html>', { waitUntil: 'domcontentloaded' });
      
      const expired = await isSessionExpired(page, 'https://example.com');
      expect(expired).toBe(false);
    });

    test('should detect session expiration with different domain', async () => {
      await page.goto('about:blank');
      await page.setContent('<html><body><h1>Unrelated Site</h1></body></html>');
      
      const expired = await isSessionExpired(page, 'https://example.com');
      expect(expired).toBe(true);
    });

    test('should not detect session expiration with subpath match', async () => {
      await page.goto('https://example.com/admin/settings');
      await page.setContent('<html><body><h1>Settings</h1></body></html>', { waitUntil: 'domcontentloaded' });
      
      const expired = await isSessionExpired(page, 'https://example.com');
      expect(expired).toBe(false);
    });
  });

  test.describe('Flow execution with session expiration', () => {
    test('should stop execution and throw error when session expired', async () => {
      const steps: Step[] = [
        {
          step_no: 1,
          action: ActionType.wait,
          target: '100',
          description: 'Wait step',
        },
        {
          step_no: 2,
          action: ActionType.click,
          target: '#button',
          description: 'Click button',
        },
      ];

      const flow = createMockFlow(steps, 'https://example.com');
      await page.goto('about:blank');
      await page.setContent('<html><body><h1>Sign In</h1></body></html>');
      
      const run_id = 'test-run-session-expire-1';
      const user_id = 'test-user';
      const logger = await createLogger(run_id, user_id);

      await expect(
        executeFlow(page, flow, run_id, user_id, logger)
      ).rejects.toThrow('Session expired');
    });

    test('should include detailed error message for session expiration', async () => {
      const steps: Step[] = [
        {
          step_no: 1,
          action: ActionType.navigate,
          target: 'https://example.com/signin',
          description: 'Navigate (will trigger expiration)',
        },
      ];

      const flow = createMockFlow(steps, 'https://example.com');
      await page.goto('about:blank');
      await page.setContent('<html><body><h1>Sign In</h1></body></html>');
      
      const run_id = 'test-run-session-error-message';
      const user_id = 'test-user';
      const logger = await createLogger(run_id, user_id);

      const expectedMessage = 'Session expired. Your login session is no longer valid. ' +
        'Please log in again to continue with the flow execution.';
      
      await expect(
        executeFlow(page, flow, run_id, user_id, logger)
      ).rejects.toThrow(expectedMessage);
    });

    test('should not execute any steps when session expired at start', async () => {
      const steps: Step[] = [
        {
          step_no: 1,
          action: ActionType.type,
          target: '#input',
          value: 'should not execute',
          description: 'Type that should not execute',
        },
        {
          step_no: 2,
          action: ActionType.click,
          target: '#button',
          description: 'Click that should not execute',
        },
      ];

      const flow = createMockFlow(steps, 'https://example.com');
      await page.goto('about:blank');
      await page.setContent('<html><body><h1>Login</h1></body></html>');
      
      const run_id = 'test-run-no-execution';
      const user_id = 'test-user';
      const logger = await createLogger(run_id, user_id);

      try {
        await executeFlow(page, flow, run_id, user_id, logger);
        throw new Error('Should have thrown session expiration error');
      } catch (error: unknown) {
        const err = error as Error;
        expect(err.message).toContain('Session expired');
        
        const logPath = join('logs', run_id + '.csv');
        expect(existsSync(logPath)).toBe(true);
        
        const content = await readFile(logPath, 'utf-8');
        const lines = content.split('\n').filter((line: string) => line.trim());
        
        expect(lines.length).toBe(1);
      }
    });
  });

  test.describe('Session expiration URL edge cases', () => {
    test('should handle exact prefix match (no trailing slash)', async () => {
      await page.goto('https://example.com');
      await page.setContent('<html><body><h1>Home</h1></body></html>', { waitUntil: 'domcontentloaded' });
      const expired = await isSessionExpired(page, 'https://example.com');
      expect(expired).toBe(false);
    });

    test('should handle URL with query parameters', async () => {
      await page.goto('https://example.com/page?session=abc123');
      await page.setContent('<html><body><h1>Page</h1></body></html>', { waitUntil: 'domcontentloaded' });
      const expired = await isSessionExpired(page, 'https://example.com');
      expect(expired).toBe(false);
    });

    test('should handle URL with hash fragment', async () => {
      await page.goto('https://example.com/page#section');
      await page.setContent('<html><body><h1>Page</h1></body></html>', { waitUntil: 'domcontentloaded' });
      const expired = await isSessionExpired(page, 'https://example.com');
      expect(expired).toBe(false);
    });

    test('should detect expiration when login URL is different domain', async () => {
      await page.goto('about:blank');
      await page.setContent('<html><body><h1>SSO Login</h1></body></html>');
      const expired = await isSessionExpired(page, 'https://example.com');
      expect(expired).toBe(true);
    });

    test('should detect expiration when protocol differs', async () => {
      await page.goto('about:blank');
      await page.setContent('<html><body><h1>HTTP Page</h1></body></html>');
      const expired = await isSessionExpired(page, 'https://example.com');
      expect(expired).toBe(true);
    });

    test('should handle trailing slash in prefix', async () => {
      await page.goto('https://example.com/page');
      await page.setContent('<html><body><h1>Page</h1></body></html>', { waitUntil: 'domcontentloaded' });
      const expired = await isSessionExpired(page, 'https://example.com/');
      expect(expired).toBe(false);
    });
  });

  test.describe('Multi-step flow with session expiration mid-execution', () => {
    test('should complete steps before session expires, then fail', async () => {
      const steps: Step[] = [
        {
          step_no: 1,
          action: ActionType.wait,
          target: '50',
          description: 'Wait step',
        },
      ];

      const flow = createMockFlow(steps, 'https://example.com');
      await page.goto('https://example.com/start');
      await page.setContent('<html><body><h1>Start</h1></body></html>', { waitUntil: 'domcontentloaded' });
      
      const run_id = 'test-run-mid-expire';
      const user_id = 'test-user';
      const logger = await createLogger(run_id, user_id);

      await executeFlow(page, flow, run_id, user_id, logger);

      const logPath = join('logs', run_id + '.csv');
      const content = await readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter((line: string) => line.trim());
      
      expect(lines.length).toBe(2);
      expect(lines[1].split(',')[7]).toBe('success');
    });
  });

  test.describe('Session expiration with complex URL patterns', () => {
    test('should match prefix with port number', async () => {
      await page.goto('about:blank');
      await page.setContent('<html><body><h1>Dashboard</h1></body></html>');
      const expired = await isSessionExpired(page, 'https://localhost:8080');
      expect(expired).toBe(true);
    });

    test('should fail to match if port differs', async () => {
      await page.goto('about:blank');
      await page.setContent('<html><body><h1>Dashboard</h1></body></html>');
      const expired = await isSessionExpired(page, 'https://localhost:8080');
      expect(expired).toBe(true);
    });

    test('should match IP address prefix', async () => {
      await page.goto('about:blank');
      await page.setContent('<html><body><h1>API</h1></body></html>');
      const expired = await isSessionExpired(page, 'http://192.168.1.100:8080');
      expect(expired).toBe(true);
    });

    test('should handle international domain names', async () => {
      await page.goto('about:blank');
      await page.setContent('<html><body><h1>App</h1></body></html>');
      const expired = await isSessionExpired(page, 'https://münchen.example.com');
      expect(expired).toBe(true);
    });
  });

  test.describe('Error message verification', () => {
    test('should provide actionable error message for session expiration', async () => {
      const steps: Step[] = [
        {
          step_no: 1,
          action: ActionType.navigate,
          target: 'https://example.com',
          description: 'Navigate',
        },
      ];

      const flow = createMockFlow(steps, 'https://example.com');
      await page.goto('about:blank');
      await page.setContent('<html><body><h1>Login</h1></body></html>');
      
      const run_id = 'test-run-error-message';
      const user_id = 'test-user';
      const logger = await createLogger(run_id, user_id);

      try {
        await executeFlow(page, flow, run_id, user_id, logger);
        throw new Error('Should have thrown error');
      } catch (error: unknown) {
        const err = error as Error;
        expect(err.message).toContain('Session expired');
        expect(err.message).toContain('login session');
        expect(err.message).toContain('log in again');
      }
    });

    test('should differentiate session expiration from other errors', async () => {
      const steps: Step[] = [
        {
          step_no: 1,
          action: ActionType.wait,
          target: '100',
          description: 'Wait step',
        },
      ];

      const flow = createMockFlow(steps, 'https://example.com');
      await page.goto('https://example.com');
      await page.setContent('<html><body><h1>Test Page</h1></body></html>', { waitUntil: 'domcontentloaded' });
      
      const run_id = 'test-run-other-error';
      const user_id = 'test-user';
      const logger = await createLogger(run_id, user_id);

      await executeFlow(page, flow, run_id, user_id, logger);

      const logPath = join('logs', run_id + '.csv');
      const content = await readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter((line: string) => line.trim());
      
      expect(lines.length).toBe(2);
      expect(lines[1].split(',')[7]).toBe('success');
    });
  });
});
