import { test, expect } from '@playwright/test';
import { readFile, readdir, rm } from 'fs/promises';
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

test.describe('Flow Executor - executeFlow', () => {
  let page: any;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('https://example.com/test');
    await page.setContent('<html><body><h1>Test Page</h1><button id="test-btn">Click Me</button><input id="test-input" type="text"/><select id="test-select"><option value="option1">Option 1</option><option value="option2">Option 2</option></select></body></html>');
  });

  test.afterEach(async () => {
    await page?.close();
    try {
      await rm('logs', { recursive: true, force: true });
      await rm('artifacts', { recursive: true, force: true });
    } catch {}
  });

  test('Flow executes all steps sequentially', async () => {
    const steps: Step[] = [
      {
        step_no: 1,
        action: ActionType.type,
        target: '#test-input',
        value: 'test value',
        description: 'Type in input',
      },
      {
        step_no: 2,
        action: ActionType.wait,
        target: '100',
        description: 'Wait 100ms',
      },
      {
        step_no: 3,
        action: ActionType.click,
        target: '#test-btn',
        description: 'Click button',
      },
    ];

    const flow = createMockFlow(steps);
    const run_id = 'test-run-sequential';
    const user_id = 'test-user';
    const logger = await createLogger(run_id, user_id);

    await executeFlow(page, flow, run_id, user_id, logger);

    const logPath = join('logs', run_id + '.csv');
    expect(existsSync(logPath)).toBe(true);

    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());

    expect(lines.length).toBe(4);
    expect(lines[1].split(',')[3]).toBe('1');
    expect(lines[2].split(',')[3]).toBe('2');
    expect(lines[3].split(',')[3]).toBe('3');
  });

  test('Artifacts captured for each step', async () => {
    const steps: Step[] = [
      {
        step_no: 1,
        action: ActionType.wait,
        target: '100',
        description: 'Step 1',
      },
      {
        step_no: 2,
        action: ActionType.click,
        target: '#test-btn',
        description: 'Step 2',
      },
    ];

    const flow = createMockFlow(steps);
    const run_id = 'test-run-artifacts';
    const user_id = 'test-user';
    const logger = await createLogger(run_id, user_id);

    await executeFlow(page, flow, run_id, user_id, logger);

    const runDir = join('artifacts', run_id);
    const files = await readdir(runDir);

    expect(files).toContain('1.png');
    expect(files).toContain('1.html');
    expect(files).toContain('2.png');
    expect(files).toContain('2.html');
  });

  test('Logs recorded for each step', async () => {
    const steps: Step[] = [
      {
        step_no: 1,
        action: ActionType.type,
        target: '#test-input',
        value: 'test value',
        description: 'Type in input',
      },
      {
        step_no: 2,
        action: ActionType.click,
        target: '#test-btn',
        description: 'Click button',
      },
    ];

    const flow = createMockFlow(steps);
    const run_id = 'test-run-logs';
    const user_id = 'test-user';
    const logger = await createLogger(run_id, user_id);

    await executeFlow(page, flow, run_id, user_id, logger);

    const logPath = join('logs', run_id + '.csv');
    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());

    const firstDataRow = lines[1].split(',');
    expect(firstDataRow[0]).toBe(run_id);
    expect(firstDataRow[1]).toBe(user_id);
    expect(firstDataRow[3]).toBe('1');
    expect(firstDataRow[5]).toBe(ActionType.type);
    expect(firstDataRow[6]).toBe('#test-input');
    expect(firstDataRow[7]).toBe('success');

    const secondDataRow = lines[2].split(',');
    expect(secondDataRow[0]).toBe(run_id);
    expect(secondDataRow[1]).toBe(user_id);
    expect(secondDataRow[3]).toBe('2');
    expect(secondDataRow[5]).toBe(ActionType.click);
    expect(secondDataRow[6]).toBe('#test-btn');
    expect(secondDataRow[7]).toBe('success');
  });

  test('Session expiration stops execution', async () => {
    const steps: Step[] = [
      {
        step_no: 1,
        action: ActionType.navigate,
        target: 'https://different-site.com/page1',
        description: 'Navigate to different site',
      },
    ];

    const flow = createMockFlow(steps, 'https://expected-prefix.com');
    const run_id = 'test-run-session-expired';
    const user_id = 'test-user';
    const logger = await createLogger(run_id, user_id);

    await expect(
      executeFlow(page, flow, run_id, user_id, logger)
    ).rejects.toThrow('Session expired');

    const logPath = join('logs', run_id + '.csv');
    expect(existsSync(logPath)).toBe(true);

    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());

    expect(lines.length).toBe(1);
  });

  test('Session expiration includes error in log message', async () => {
    const steps: Step[] = [
      {
        step_no: 1,
        action: ActionType.navigate,
        target: 'https://different-site.com/page1',
        description: 'Navigate to different site',
      },
    ];

    const flow = createMockFlow(steps, 'https://expected-prefix.com');
    const run_id = 'test-run-session-error';
    const user_id = 'test-user';
    const logger = await createLogger(run_id, user_id);

    await expect(
      executeFlow(page, flow, run_id, user_id, logger)
    ).rejects.toThrow('Session expired. Your login session is no longer valid. Please log in again to continue with the flow execution.');
  });

  test('Flow handles wait action', async () => {
    const steps: Step[] = [
      {
        step_no: 1,
        action: ActionType.wait,
        target: '100',
        description: 'Wait 100ms',
      },
      {
        step_no: 2,
        action: ActionType.type,
        target: '#test-input',
        value: 'after wait',
        description: 'Type after wait',
      },
    ];

    const flow = createMockFlow(steps);
    const run_id = 'test-run-wait';
    const user_id = 'test-user';
    const logger = await createLogger(run_id, user_id);

    const startTime = Date.now();
    await executeFlow(page, flow, run_id, user_id, logger);
    const elapsedTime = Date.now() - startTime;

    expect(elapsedTime).toBeGreaterThanOrEqual(100);

    const logPath = join('logs', run_id + '.csv');
    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());

    expect(lines.length).toBe(3);
  });

  test('Flow handles select action', async () => {
    const steps: Step[] = [
      {
        step_no: 1,
        action: ActionType.select,
        target: '#test-select',
        value: 'option2',
        description: 'Select option 2',
      },
    ];

    const flow = createMockFlow(steps);
    const run_id = 'test-run-select';
    const user_id = 'test-user';
    const logger = await createLogger(run_id, user_id);

    await executeFlow(page, flow, run_id, user_id, logger);

    await expect(page.locator('#test-select')).toHaveValue('option2');

    const logPath = join('logs', run_id + '.csv');
    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());

    expect(lines.length).toBe(2);
    expect(lines[1].split(',')[5]).toBe(ActionType.select);
  });
});

test.describe('Flow Executor - isSessionExpired', () => {
  let page: any;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('isSessionExpired returns true when URL does not start with prefix', async () => {
    await page.goto('https://example.com/different-page');
    const expired = await isSessionExpired(page, 'https://other-prefix.com');
    expect(expired).toBe(true);
  });

  test('isSessionExpired returns false when URL starts with prefix', async () => {
    await page.goto('https://example.com/page');
    const expired = await isSessionExpired(page, 'https://example.com');
    expect(expired).toBe(false);
  });

  test('isSessionExpired handles exact URL match', async () => {
    await page.goto('https://example.com');
    const expired = await isSessionExpired(page, 'https://example.com');
    expect(expired).toBe(false);
  });

  test('isSessionExpired handles subpath URLs', async () => {
    await page.goto('https://example.com/app/dashboard');
    const expired = await isSessionExpired(page, 'https://example.com/app');
    expect(expired).toBe(false);
  });
});
