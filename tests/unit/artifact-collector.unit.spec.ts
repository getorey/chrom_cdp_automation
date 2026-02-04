import { test, expect } from '@playwright/test';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import {
  initArtifactsDirectory,
  captureScreenshot,
  captureHtml,
} from '../../src/runner/artifact-collector.js';

test.describe.configure({ mode: 'serial' });

test.describe('Artifact Collector - initArtifactsDirectory', () => {
  test('should create artifacts directory if it does not exist', async () => {
    const runId = 'test-run-001';
    const runDir = join('artifacts', runId);

    await initArtifactsDirectory(runId);

    const dirStat = await stat(runDir);
    expect(dirStat.isDirectory()).toBe(true);
  });

  test('should not throw error if directory already exists', async () => {
    const runId = 'test-run-002';

    await initArtifactsDirectory(runId);
    await expect(initArtifactsDirectory(runId)).resolves.not.toThrow();
  });

  test('should create nested directory structure correctly', async () => {
    const runId = 'test-run-nested-001';
    const runDir = join('artifacts', runId);

    await initArtifactsDirectory(runId);

    const dirStat = await stat(runDir);
    expect(dirStat.isDirectory()).toBe(true);
  });
});

test.describe('Artifact Collector - captureScreenshot', () => {
  let page: any;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('should save screenshot as {run_id}/{step_no}.png', async () => {
    const runId = 'screenshot-test-001';
    const stepNo = 1;
    await page.setContent('<h1>Test Page</h1>');

    await captureScreenshot(page, runId, stepNo);

    const runDir = join('artifacts', runId);
    const expectedPath = join(runDir, `${stepNo}.png`);
    const fileStat = await stat(expectedPath);
    expect(fileStat.isFile()).toBe(true);
  });

  test('should save screenshot with full page', async () => {
    const runId = 'screenshot-test-002';
    const stepNo = 1;
    await page.setContent(`
      <div style="height: 2000px;">
        <h1>Test Page</h1>
        <p>This is a long page</p>
      </div>
    `);

    await captureScreenshot(page, runId, stepNo);

    const runDir = join('artifacts', runId);
    const expectedPath = join(runDir, `${stepNo}.png`);
    const fileStat = await stat(expectedPath);
    expect(fileStat.isFile()).toBe(true);
  });

  test('should create artifact directory if it does not exist', async () => {
    const runId = 'screenshot-test-003';
    const stepNo = 1;
    await page.setContent('<h1>Test Page</h1>');

    await captureScreenshot(page, runId, stepNo);

    const runDir = join('artifacts', runId);
    const dirStat = await stat(runDir);
    expect(dirStat.isDirectory()).toBe(true);
  });

  test('should use correct path format for screenshots', async () => {
    const runId = 'screenshot-test-004';
    const stepNo = 5;
    await page.setContent('<h1>Test Page</h1>');

    await captureScreenshot(page, runId, stepNo);

    const expectedPath = join('artifacts', runId, `${stepNo}.png`);
    const fileStat = await stat(expectedPath);
    expect(fileStat.isFile()).toBe(true);
  });

  test('should save multiple screenshots for different steps', async () => {
    const runId = 'screenshot-test-005';

    await page.setContent('<h1>Step 1</h1>');
    await captureScreenshot(page, runId, 1);

    await page.setContent('<h1>Step 2</h1>');
    await captureScreenshot(page, runId, 2);

    await page.setContent('<h1>Step 3</h1>');
    await captureScreenshot(page, runId, 3);

    const runDir = join('artifacts', runId);
    const files = await readdir(runDir);

    expect(files).toContain('1.png');
    expect(files).toContain('2.png');
    expect(files).toContain('3.png');
  });
});

test.describe('Artifact Collector - captureHtml', () => {
  let page: any;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('should save HTML as {run_id}/{step_no}.html', async () => {
    const runId = 'html-test-001';
    const stepNo = 1;
    const testContent = '<h1>Test Page</h1><p>Content</p>';
    await page.setContent(testContent);

    await captureHtml(page, runId, stepNo);

    const runDir = join('artifacts', runId);
    const expectedPath = join(runDir, `${stepNo}.html`);
    const fileStat = await stat(expectedPath);
    expect(fileStat.isFile()).toBe(true);
  });

  test('should save correct HTML content', async () => {
    const runId = 'html-test-002';
    const stepNo = 1;
    const testContent = '<h1>Test Page</h1><p>Content</p>';
    await page.setContent(testContent);

    await captureHtml(page, runId, stepNo);

    const runDir = join('artifacts', runId);
    const expectedPath = join(runDir, `${stepNo}.html`);
    const fileStat = await stat(expectedPath);
    expect(fileStat.isFile()).toBe(true);
  });

  test('should create artifact directory if it does not exist', async () => {
    const runId = 'html-test-003';
    const stepNo = 1;
    await page.setContent('<h1>Test Page</h1>');

    await captureHtml(page, runId, stepNo);

    const runDir = join('artifacts', runId);
    const dirStat = await stat(runDir);
    expect(dirStat.isDirectory()).toBe(true);
  });

  test('should use correct path format for HTML files', async () => {
    const runId = 'html-test-004';
    const stepNo = 3;
    await page.setContent('<h1>Test Page</h1>');

    await captureHtml(page, runId, stepNo);

    const expectedPath = join('artifacts', runId, `${stepNo}.html`);
    const fileStat = await stat(expectedPath);
    expect(fileStat.isFile()).toBe(true);
  });

  test('should save HTML with page content', async () => {
    const runId = 'html-test-005';
    const stepNo = 1;
    const testContent = '<h1>Test Page</h1><p>Content</p>';
    await page.setContent(testContent);

    await captureHtml(page, runId, stepNo);

    const runDir = join('artifacts', runId);
    const expectedPath = join(runDir, `${stepNo}.html`);
    const fileStat = await stat(expectedPath);
    expect(fileStat.isFile()).toBe(true);
  });

  test('should save multiple HTML files for different steps', async () => {
    const runId = 'html-test-006';

    await page.setContent('<h1>Step 1</h1>');
    await captureHtml(page, runId, 1);

    await page.setContent('<h1>Step 2</h1>');
    await captureHtml(page, runId, 2);

    await page.setContent('<h1>Step 3</h1>');
    await captureHtml(page, runId, 3);

    const runDir = join('artifacts', runId);
    const files = await readdir(runDir);

    expect(files).toContain('1.html');
    expect(files).toContain('2.html');
    expect(files).toContain('3.html');
  });
});

test.describe('Artifact Collector - Integration Tests', () => {
  let page: any;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('should capture both screenshot and HTML for same step', async () => {
    const runId = 'integration-test-001';
    const stepNo = 1;
    await page.setContent('<h1>Test Page</h1>');

    await captureScreenshot(page, runId, stepNo);
    await captureHtml(page, runId, stepNo);

    const runDir = join('artifacts', runId);
    const files = await readdir(runDir);

    expect(files).toContain(`${stepNo}.png`);
    expect(files).toContain(`${stepNo}.html`);
  });

  test('should handle multiple run directories', async () => {
    await page.setContent('<h1>Run 1</h1>');
    await captureScreenshot(page, 'run-001', 1);

    await page.setContent('<h1>Run 2</h1>');
    await captureScreenshot(page, 'run-002', 1);

    const runDir1 = join('artifacts', 'run-001');
    const runDir2 = join('artifacts', 'run-002');

    const files1 = await readdir(runDir1);
    const files2 = await readdir(runDir2);

    expect(files1).toContain('1.png');
    expect(files2).toContain('1.png');
  });

  test('should preserve artifacts from different runs', async () => {
    await page.setContent('<h1>First Run</h1>');
    await captureScreenshot(page, 'multi-run-001', 1);
    await captureHtml(page, 'multi-run-001', 1);

    await page.setContent('<h1>Second Run</h1>');
    await captureScreenshot(page, 'multi-run-001', 2);
    await captureHtml(page, 'multi-run-001', 2);

    await page.setContent('<h1>Other Run</h1>');
    await captureScreenshot(page, 'multi-run-002', 1);
    await captureHtml(page, 'multi-run-002', 1);

    const runDir1 = join('artifacts', 'multi-run-001');
    const runDir2 = join('artifacts', 'multi-run-002');

    const files1 = await readdir(runDir1);
    const files2 = await readdir(runDir2);

    expect(files1.length).toBe(4);
    expect(files1).toContain('1.png');
    expect(files1).toContain('1.html');
    expect(files1).toContain('2.png');
    expect(files1).toContain('2.html');

    expect(files2.length).toBe(2);
    expect(files2).toContain('1.png');
    expect(files2).toContain('1.html');
  });
});
