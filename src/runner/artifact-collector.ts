import { CDPConnector } from './cdp-connector.js';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { Page } from 'playwright';
import { getArtifactsPath } from '../config/index.js';

export class ArtifactCollector {
  async capture(name: string, cdpConnector: CDPConnector): Promise<void> {
    const page = cdpConnector.getPage();
    const artifactsDir = getArtifactsPath();

    await mkdir(artifactsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    await page.screenshot({
      path: join(artifactsDir, `${name}-${timestamp}.png`),
      fullPage: true,
    });

    const html = await page.content();
    await writeFile(join(artifactsDir, `${name}-${timestamp}.html`), html);
  }
}

/**
 * Initializes the artifact directory for a specific test run.
 * Creates the artifacts/{run_id} directory if it doesn't exist.
 *
 * @param runId - Unique identifier for the test run
 * @throws Error if directory creation fails
 *
 * @example
 * await initArtifactsDirectory('test-run-123');
 */
export async function initArtifactsDirectory(runId: string): Promise<void> {
  const artifactsDir = getArtifactsPath();
  const runDir = join(artifactsDir, runId);
  await mkdir(runDir, { recursive: true });
}

/**
 * Captures a screenshot and saves it to artifacts/{run_id}/{step_no}.png
 *
 * @param page - Playwright Page instance to capture
 * @param runId - Unique identifier for the test run
 * @param stepNo - Step number for the screenshot
 * @throws Error if screenshot capture or directory creation fails
 *
 * @example
 * const browser = await connectToChrome();
 * const page = await selectFirstTab(browser);
 * await captureScreenshot(page, 'test-run-123', 1);
 */
export async function captureScreenshot(page: Page, runId: string, stepNo: number): Promise<void> {
  await initArtifactsDirectory(runId);

  const artifactsDir = getArtifactsPath();
  const runDir = join(artifactsDir, runId);
  const screenshotPath = join(runDir, `${stepNo}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

/**
 * Captures the HTML content of a page and saves it to artifacts/{run_id}/{step_no}.html
 *
 * @param page - Playwright Page instance to capture
 * @param runId - Unique identifier for the test run
 * @param stepNo - Step number for the HTML file
 * @throws Error if HTML capture or directory creation fails
 *
 * @example
 * const browser = await connectToChrome();
 * const page = await selectFirstTab(browser);
 * await captureHtml(page, 'test-run-123', 1);
 */
export async function captureHtml(page: Page, runId: string, stepNo: number): Promise<void> {
  await initArtifactsDirectory(runId);

  const artifactsDir = getArtifactsPath();
  const runDir = join(artifactsDir, runId);
  const htmlPath = join(runDir, `${stepNo}.html`);
  const html = await page.content();
  await writeFile(htmlPath, html);
}
