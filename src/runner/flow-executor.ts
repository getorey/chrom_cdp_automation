import { Page } from 'playwright';
import { Flow, LogEntry } from '../models/flow.js';
import { Logger } from '../logger/index.js';
import { CDPConnector } from './cdp-connector.js';
import { StepHandler } from './step-handler.js';
import { captureScreenshot, captureHtml } from './artifact-collector.js';

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

    for (let iteration = 1; iteration <= repeatCount; iteration++) {
      try {
        const stepResult = await stepHandler.execute(step, cdpConnector);

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
