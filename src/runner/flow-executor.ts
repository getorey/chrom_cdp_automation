import { Page } from 'playwright';
import { Flow, LogEntry } from '../models/flow.js';
import { Logger } from '../logger/index.js';
import { CDPConnector } from './cdp-connector.js';
import { StepHandler } from './step-handler.js';
import { captureScreenshot, captureHtml } from './artifact-collector.js';

/**
 * Compare two screenshot buffers to check if they are identical.
 * Uses both length check and content comparison for efficiency.
 */
function areScreenshotsIdentical(prevBuffer: Buffer | null, currentBuffer: Buffer): boolean {
  if (!prevBuffer) {
    return false;
  }
  if (prevBuffer.length !== currentBuffer.length) {
    return false;
  }
  return prevBuffer.equals(currentBuffer);
}

export async function executeFlow(
  page: Page,
  flow: Flow,
  run_id: string,
  _user_id: string,
  logger: Logger,
  cdpConnector: CDPConnector,
): Promise<void> {
  const firstStep = flow.steps[0];
  const shouldSkipInitialCheck = firstStep?.action === 'navigate';

  if (!shouldSkipInitialCheck) {
    const expired = await isSessionExpired(page, flow.url_prefix);
    if (expired) {
      throw new Error(
        'Session expired. Your login session is no longer valid. ' +
        'Please log in again to continue with flow execution.'
      );
    }
  }

  const stepHandler = new StepHandler(flow, cdpConnector);

  for (const step of flow.steps) {
    const currentUrl = page.url();
    const action = step.action;
    const repeatCount = step.repeat ?? 1;
    const continueOnError = step.continue_on_error ?? false;
    const skipOnChange = step.skip_on_change ?? false;

    // Store previous screenshot for comparison when skip_on_change is enabled
    let previousScreenshot: Buffer | null = null;

    for (let iteration = 1; iteration <= repeatCount; iteration++) {
      try {
        // Determine if we should skip vision fallback based on screen changes
        let shouldSkipVisionFallback = false;

        if (skipOnChange && iteration > 1 && previousScreenshot) {
          const currentScreenshot = await page.screenshot({ type: 'png' });
          const isScreenChanged = !areScreenshotsIdentical(previousScreenshot, currentScreenshot);

          if (isScreenChanged) {
            // Screen changed: skip vision fallback (screen already progressed)
            console.log(`[SkipOnChange] Step ${step.step_no} iteration ${iteration}: Screen changed, skipping vision fallback`);
            shouldSkipVisionFallback = true;
          } else {
            // Screen unchanged: call vision fallback (need LLM to progress)
            console.log(`[SkipOnChange] Step ${step.step_no} iteration ${iteration}: Screen unchanged, calling vision fallback`);
          }
          previousScreenshot = currentScreenshot;
        }

        const stepResult = await stepHandler.execute(step, cdpConnector, shouldSkipVisionFallback);

        // Store screenshot after successful execution for next iteration comparison
        if (skipOnChange) {
          previousScreenshot = await page.screenshot({ type: 'png' });
        }

        await captureScreenshot(page, run_id, step.step_no);
        await captureHtml(page, run_id, step.step_no);

        let result: 'success' | 'failed' | 'vision_fallback_success' = 'success';
        let logError: string | undefined;

        if (stepResult.usedVision) {
          result = 'vision_fallback_success';
          logError = stepResult.visionError;
        }

        const logEntry: Omit<LogEntry, 'run_id' | 'user_id' | 'timestamp'> = {
          step_no: step.step_no,
          url: currentUrl,
          action: action,
          target: step.target,
          result,
          ...(logError ? { error: logError } : {}),
          ...(repeatCount > 1 ? { iteration } : {}),
        };

        await logger.logStep(logEntry);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await captureScreenshot(page, run_id, step.step_no);
        await captureHtml(page, run_id, step.step_no);

        const errorLogEntry: Omit<LogEntry, 'run_id' | 'user_id' | 'timestamp'> = {
          step_no: step.step_no,
          url: currentUrl,
          action: action,
          target: step.target,
          result: 'failed',
          error: errorMessage,
          ...(repeatCount > 1 ? { iteration } : {}),
        };

        await logger.logStep(errorLogEntry);

        if (!continueOnError) {
          throw error;
        }
      }
    }
  }
}

export async function runFlow(
  flow: Flow,
  cdpConnector: CDPConnector,
): Promise<void> {
  const stepHandler = new StepHandler(flow, cdpConnector);

  for (const step of flow.steps) {
    await stepHandler.execute(step, cdpConnector);
  }
}

export async function isSessionExpired(
  page: Page,
  url_prefix: string,
): Promise<boolean> {
  const currentUrl = page.url();
  return !currentUrl.startsWith(url_prefix);
}
