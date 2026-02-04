import { test, expect } from '@playwright/test';
import { readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { createLogger, logStep } from '../../src/logger';

test.describe('Logger Unit Tests', () => {
  const testLogsDir = join(process.cwd(), 'logs');
  const testRunId = 'test-run-001';
  const testUserId = 'test-user-001';
  const testRunId2 = 'test-run-002';

  test.afterEach(async () => {
    try {
      await rm(testLogsDir, { recursive: true, force: true });
    } catch {
    }
  });

  test('CSV file created with correct headers', async () => {
    const logger = await createLogger(testRunId, testUserId);
    const logPath = join(testLogsDir, `${testRunId}.csv`);

    expect(existsSync(logPath)).toBe(true);

    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());
    expect(lines[0]).toBe('run_id,user_id,timestamp,step_no,url,action,target,result,error');
  });

  test('Each step logged correctly', async () => {
    const logger = await createLogger(testRunId, testUserId);
    const logPath = join(testLogsDir, `${testRunId}.csv`);

    await logger.logStep({
      step_no: 1,
      url: 'https://example.com',
      action: 'navigate',
      target: '',
      result: 'success',
    });

    await logger.logStep({
      step_no: 2,
      url: 'https://example.com/page',
      action: 'click',
      target: '#submit-button',
      result: 'success',
    });

    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());

    const firstDataRow = lines[1].split(',');
    expect(firstDataRow[0]).toBe(testRunId);
    expect(firstDataRow[1]).toBe(testUserId);
    expect(firstDataRow[3]).toBe('1');
    expect(firstDataRow[4]).toBe('https://example.com');
    expect(firstDataRow[5]).toBe('navigate');
    expect(firstDataRow[7]).toBe('success');

    const secondDataRow = lines[2].split(',');
    expect(secondDataRow[0]).toBe(testRunId);
    expect(secondDataRow[1]).toBe(testUserId);
    expect(secondDataRow[3]).toBe('2');
    expect(secondDataRow[4]).toBe('https://example.com/page');
    expect(secondDataRow[5]).toBe('click');
    expect(secondDataRow[6]).toBe('#submit-button');
    expect(secondDataRow[7]).toBe('success');
  });

  test('Errors logged with details', async () => {
    const logger = await createLogger(testRunId, testUserId);
    const logPath = join(testLogsDir, `${testRunId}.csv`);

    const errorMessage = 'Element not found: #missing-element';

    await logger.logStep({
      step_no: 1,
      url: 'https://example.com',
      action: 'click',
      target: '#missing-element',
      result: 'error',
      error: errorMessage,
    });

    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());
    const dataRow = lines[1].split(',');

    expect(dataRow[0]).toBe(testRunId);
    expect(dataRow[1]).toBe(testUserId);
    expect(dataRow[7]).toBe('error');
    expect(dataRow[8]).toBe(errorMessage);
  });

  test('Optional error field handled correctly (empty string when no error)', async () => {
    const logger = await createLogger(testRunId, testUserId);
    const logPath = join(testLogsDir, `${testRunId}.csv`);

    await logger.logStep({
      step_no: 1,
      url: 'https://example.com',
      action: 'navigate',
      target: '',
      result: 'success',
    });

    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());
    const dataRow = lines[1].split(',');

    expect(dataRow.length).toBe(9);
    expect(dataRow[8]).toBe('');
  });

  test('Optional error field handled correctly (explicit undefined)', async () => {
    const logger = await createLogger(testRunId, testUserId);
    const logPath = join(testLogsDir, `${testRunId}.csv`);

    await logger.logStep({
      step_no: 1,
      url: 'https://example.com',
      action: 'navigate',
      target: '',
      result: 'success',
      error: undefined,
    });

    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());
    const dataRow = lines[1].split(',');

    expect(dataRow[8]).toBe('');
  });

  test('Multiple runs create separate log files', async () => {
    const logger1 = await createLogger(testRunId, testUserId);
    const logger2 = await createLogger(testRunId2, testUserId);

    const logPath1 = join(testLogsDir, `${testRunId}.csv`);
    const logPath2 = join(testLogsDir, `${testRunId2}.csv`);

    await logger1.logStep({
      step_no: 1,
      url: 'https://example.com',
      action: 'navigate',
      target: '',
      result: 'success',
    });

    await logger2.logStep({
      step_no: 1,
      url: 'https://example.com/page2',
      action: 'click',
      target: '#button',
      result: 'success',
    });

    expect(existsSync(logPath1)).toBe(true);
    expect(existsSync(logPath2)).toBe(true);

    const content1 = await readFile(logPath1, 'utf-8');
    expect(content1).toContain('https://example.com');

    const content2 = await readFile(logPath2, 'utf-8');
    expect(content2).toContain('https://example.com/page2');

    const lines2 = content2.split('\n').filter((line: string) => line.trim());
    const dataRow2 = lines2[1].split(',');
    expect(dataRow2[4]).toBe('https://example.com/page2');
  });

  test('Timestamps in ISO format', async () => {
    const logger = await createLogger(testRunId, testUserId);
    const logPath = join(testLogsDir, `${testRunId}.csv`);

    await logger.logStep({
      step_no: 1,
      url: 'https://example.com',
      action: 'navigate',
      target: '',
      result: 'success',
    });

    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());
    const dataRow = lines[1].split(',');

    const timestamp = dataRow[2];

    const isoFormatRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(timestamp).toMatch(isoFormatRegex);
  });

  test('logStep standalone function works correctly', async () => {
    const logPath = join(testLogsDir, `${testRunId}.csv`);

    await logStep({
      run_id: testRunId,
      user_id: testUserId,
      timestamp: new Date('2024-01-01T12:00:00.000Z').toISOString(),
      step_no: 1,
      url: 'https://example.com',
      action: 'navigate',
      target: '',
      result: 'success',
    });

    expect(existsSync(logPath)).toBe(true);

    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());

    expect(lines[0]).toBe('run_id,user_id,timestamp,step_no,url,action,target,result,error');

    const dataRow = lines[1].split(',');
    expect(dataRow[0]).toBe(testRunId);
    expect(dataRow[1]).toBe(testUserId);
    expect(dataRow[2]).toBe('2024-01-01T12:00:00.000Z');
    expect(dataRow[3]).toBe('1');
    expect(dataRow[4]).toBe('https://example.com');
    expect(dataRow[5]).toBe('navigate');
    expect(dataRow[7]).toBe('success');
    expect(dataRow[8]).toBe('');
  });

  test('logStep standalone function handles error field correctly', async () => {
    const logPath = join(testLogsDir, `${testRunId}.csv`);

    await logStep({
      run_id: testRunId,
      user_id: testUserId,
      timestamp: new Date('2024-01-01T12:00:00.000Z').toISOString(),
      step_no: 1,
      url: 'https://example.com',
      action: 'click',
      target: '#button',
      result: 'error',
      error: 'Element not found',
    });

    const content = await readFile(logPath, 'utf-8');
    const lines = content.split('\n').filter((line: string) => line.trim());
    const dataRow = lines[1].split(',');

    expect(dataRow[7]).toBe('error');
    expect(dataRow[8]).toBe('Element not found');
  });
});
