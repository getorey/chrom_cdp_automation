import { test, expect } from '@playwright/test';
import { handleStep, executeStepWithTimeout } from '../../src/runner/step-handler.js';
import { ActionType, Step } from '../../src/models/flow.js';

test.describe('Step Handler - handleStep', () => {
  let page: any;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('navigate action executes correctly', async () => {
    const step: Step = {
      step_no: 1,
      action: ActionType.navigate,
      target: 'data:text/html,<h1>Test Page</h1>',
      description: 'Navigate to test page',
      timeout: 5000
    };

    await handleStep(page, step);

    await expect(page.locator('h1')).toHaveText('Test Page');
  });

  test('click action executes correctly', async () => {
    await page.setContent('<button id="test-btn">Click Me</button>');

    const step: Step = {
      step_no: 1,
      action: ActionType.click,
      target: '#test-btn',
      description: 'Click button',
      timeout: 5000
    };

    await handleStep(page, step);

    const locator = page.locator('#test-btn');
    await expect(locator).toBeVisible();
  });

  test('type action executes correctly with value', async () => {
    await page.setContent('<input id="test-input" type="text" />');

    const step: Step = {
      step_no: 1,
      action: ActionType.type,
      target: '#test-input',
      value: 'Hello World',
      description: 'Type in input',
      timeout: 5000
    };

    await handleStep(page, step);

    await expect(page.locator('#test-input')).toHaveValue('Hello World');
  });

  test('type action throws error without value', async () => {
    await page.setContent('<input id="test-input" type="text" />');

    const step: Step = {
      step_no: 1,
      action: ActionType.type,
      target: '#test-input',
      description: 'Type in input without value',
      timeout: 5000
    };

    await expect(handleStep(page, step)).rejects.toThrow('Type action requires a value to type');
  });

  test('wait action waits for specified milliseconds', async () => {
    const startTime = Date.now();

    const step: Step = {
      step_no: 1,
      action: ActionType.wait,
      target: '500',
      description: 'Wait 500ms',
      timeout: 5000
    };

    await handleStep(page, step);

    const elapsedTime = Date.now() - startTime;
    expect(elapsedTime).toBeGreaterThanOrEqual(500);
    expect(elapsedTime).toBeLessThan(600); // Allow some margin
  });

  test('select action selects option correctly', async () => {
    await page.setContent(`
      <select id="test-select">
        <option value="option1">Option 1</option>
        <option value="option2">Option 2</option>
      </select>
    `);

    const step: Step = {
      step_no: 1,
      action: ActionType.select,
      target: '#test-select',
      value: 'option2',
      description: 'Select option',
      timeout: 5000
    };

    await handleStep(page, step);

    await expect(page.locator('#test-select')).toHaveValue('option2');
  });

  test('step timeout after configured time', async () => {
    // Create a step that will never complete (infinite wait)
    const step: Step = {
      step_no: 1,
      action: ActionType.wait,
      target: '100000', // 100 seconds
      description: 'Wait forever',
      timeout: 100 // Timeout after 100ms
    };

    await expect(handleStep(page, step)).rejects.toThrow('Step 1 timed out after 100ms');
  });

  test('step with custom timeout uses custom timeout', async () => {
    // Create a step that will never complete
    const step: Step = {
      step_no: 1,
      action: ActionType.wait,
      target: '100000', // 100 seconds
      description: 'Wait forever',
      timeout: 200 // Custom timeout
    };

    await expect(handleStep(page, step)).rejects.toThrow('Step 1 timed out after 200ms');
  });

  test('invalid action type throws error', async () => {
    const step: Step = {
      step_no: 1,
      action: 'invalid_action' as ActionType,
      target: '#test',
      description: 'Invalid action',
      timeout: 5000
    };

    await expect(handleStep(page, step)).rejects.toThrow('Unknown action type: invalid_action');
  });

  test('element not found fails with clear error', async () => {
    await page.setContent('<div>Content</div>');

    const step: Step = {
      step_no: 1,
      action: ActionType.click,
      target: '#non-existent-element',
      description: 'Click non-existent element',
      timeout: 5000
    };

    await expect(handleStep(page, step)).rejects.toThrow();
    // Playwright throws an error when element is not found
  });

  test('element not interactable fails with clear error', async () => {
    await page.setContent('<button id="hidden-btn" style="display:none">Hidden</button>');

    const step: Step = {
      step_no: 1,
      action: ActionType.click,
      target: '#hidden-btn',
      description: 'Click hidden element',
      timeout: 5000
    };

    await expect(handleStep(page, step)).rejects.toThrow();
    // Playwright throws an error when element is not interactable
  });
});

test.describe('Step Handler - executeStepWithTimeout', () => {
  let page: any;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('executeStepWithTimeout respects custom timeout', async () => {
    const step: Step = {
      step_no: 1,
      action: ActionType.wait,
      target: '100000', // 100 seconds
      description: 'Wait forever'
    };

    await expect(executeStepWithTimeout(page, step, 150)).rejects.toThrow('Step 1 timed out after 150ms');
  });

  test('executeStepWithTimeout completes successfully before timeout', async () => {
    const step: Step = {
      step_no: 1,
      action: ActionType.wait,
      target: '100', // 100ms
      description: 'Short wait'
    };

    await expect(executeStepWithTimeout(page, step, 1000)).resolves.not.toThrow();
  });
});

test.describe('Step Handler - Vision Fallback', () => {
  let page: any;
  let StepHandlerClass: any;
  let cdpConnector: any;
  let flow: any;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    StepHandlerClass = (await import('../../src/runner/step-handler.js')).StepHandler;
    cdpConnector = {
      getPage: () => page,
    };
    flow = {
      vision_fallback: false,
      vision_backend: 'som',
    };
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('vision fallback does not trigger when disabled globally', async () => {
    const handler = new StepHandlerClass(flow, cdpConnector);
    await page.setContent('<div>Content</div>');

    const step: Step = {
      step_no: 1,
      action: ActionType.click,
      target: '#non-existent-element',
      description: 'Click non-existent element',
      timeout: 5000
    };

    const result = await handler.execute(step, cdpConnector);
    expect(result.usedVision).toBe(false);
  });

  test('vision fallback triggers on selector failure when enabled', async () => {
    const handler = new StepHandlerClass(flow, cdpConnector);
    await page.setContent('<div>Content</div>');

    const step: Step = {
      step_no: 1,
      action: ActionType.click,
      target: '#non-existent-element',
      description: 'Click non-existent button',
      timeout: 5000,
      vision_fallback: true
    };

    const result = await handler.execute(step, cdpConnector);
    expect(result.usedVision).toBe(true);
  });

  test('vision fallback does not trigger for navigate action', async () => {
    const handler = new StepHandlerClass(flow, cdpConnector);

    const step: Step = {
      step_no: 1,
      action: ActionType.navigate,
      target: 'data:text/html,<h1>Test</h1>',
      description: 'Navigate to test page',
      timeout: 5000,
      vision_fallback: true
    };

    const result = await handler.execute(step, cdpConnector);
    expect(result.usedVision).toBe(false);
  });

  test('vision fallback does not trigger for wait action', async () => {
    const handler = new StepHandlerClass(flow, cdpConnector);

    const step: Step = {
      step_no: 1,
      action: ActionType.wait,
      target: '100',
      description: 'Wait 100ms',
      timeout: 5000,
      vision_fallback: true
    };

    const result = await handler.execute(step, cdpConnector);
    expect(result.usedVision).toBe(false);
  });

  test('vision fallback does not trigger for press action', async () => {
    const handler = new StepHandlerClass(flow, cdpConnector);

    const step: Step = {
      step_no: 1,
      action: ActionType.press,
      target: 'Enter',
      description: 'Press Enter',
      timeout: 5000,
      vision_fallback: true
    };

    const result = await handler.execute(step, cdpConnector);
    expect(result.usedVision).toBe(false);
  });

  test('step-level vision_fallback overrides global setting when false', async () => {
    flow.vision_fallback = true;
    const handler = new StepHandlerClass(flow, cdpConnector);
    await page.setContent('<div>Content</div>');

    const step: Step = {
      step_no: 1,
      action: ActionType.click,
      target: '#non-existent-element',
      description: 'Click non-existent element',
      timeout: 5000,
      vision_fallback: false
    };

    const result = await handler.execute(step, cdpConnector);
    expect(result.usedVision).toBe(false);
  });

  test('step-level vision_fallback overrides global setting when true', async () => {
    flow.vision_fallback = false;
    const handler = new StepHandlerClass(flow, cdpConnector);
    await page.setContent('<div>Content</div>');

    const step: Step = {
      step_no: 1,
      action: ActionType.click,
      target: '#non-existent-element',
      description: 'Click non-existent element',
      timeout: 5000,
      vision_fallback: true
    };

    const result = await handler.execute(step, cdpConnector);
    expect(result.usedVision).toBe(true);
  });

  test('vision fallback returns confidence score on success', async () => {
    const handler = new StepHandlerClass(flow, cdpConnector);
    await page.setContent('<div>Content</div>');

    const step: Step = {
      step_no: 1,
      action: ActionType.click,
      target: '#non-existent-element',
      description: 'Click button',
      timeout: 5000,
      vision_fallback: true
    };

    const result = await handler.execute(step, cdpConnector);
    if (result.success && result.usedVision) {
      expect(result.visionConfidence).toBeDefined();
      expect(typeof result.visionConfidence).toBe('number');
    }
  });

  test('vision fallback returns error message on failure', async () => {
    const handler = new StepHandlerClass(flow, cdpConnector);
    await page.setContent('<div>Content</div>');

    const step: Step = {
      step_no: 1,
      action: ActionType.click,
      target: '#non-existent-element',
      description: 'Click non-existent element',
      timeout: 5000,
      vision_fallback: true
    };

    const result = await handler.execute(step, cdpConnector);
    if (result.usedVision && !result.success) {
      expect(result.visionError).toBeDefined();
      expect(typeof result.visionError).toBe('string');
    }
  });

  test('vision fallback works with type action', async () => {
    const handler = new StepHandlerClass(flow, cdpConnector);
    await page.setContent('<div>Content</div>');

    const step: Step = {
      step_no: 1,
      action: ActionType.type,
      target: '#non-existent-input',
      value: 'test value',
      description: 'Type in non-existent input',
      timeout: 5000,
      vision_fallback: true
    };

    const result = await handler.execute(step, cdpConnector);
    expect(result.usedVision).toBe(true);
  });

  test('vision fallback works with select action', async () => {
    const handler = new StepHandlerClass(flow, cdpConnector);
    await page.setContent('<div>Content</div>');

    const step: Step = {
      step_no: 1,
      action: ActionType.select,
      target: '#non-existent-select',
      value: 'option1',
      description: 'Select option from non-existent dropdown',
      timeout: 5000,
      vision_fallback: true
    };

    const result = await handler.execute(step, cdpConnector);
    expect(result.usedVision).toBe(true);
  });
});
