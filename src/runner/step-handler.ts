import { Page } from 'playwright';
import { CDPConnector } from './cdp-connector.js';
import { Step, ActionType, Flow } from '../models/flow.js';
import { VisionBackend, VisionFallbackError, VisionFallbackErrorType, captureScreenshotForVision, convertVisionToPageCoordinates, executeActionAtCoordinates } from './vision-fallback.js';
import { SoMBackend } from './vision-som-backend.js';
import { OmniParserBackend } from './vision-omniparser-backend.js';
import { findTemplate, loadTemplateImage, loadTemplateFromBase64 } from './template-matcher.js';

export class StepHandler {
  private visionBackend: VisionBackend | undefined;
  private globalVisionFallbackEnabled = false;
  private globalVisionBackendType: 'som' | 'omniparser' = 'som';
  private visionApiUrl: string | undefined;
  private page: Page | null = null;

  constructor(
    flow: Flow,
    private cdpConnector: CDPConnector
  ) {
    this.globalVisionFallbackEnabled = flow.vision_fallback ?? false;
    this.globalVisionBackendType = flow.vision_backend ?? 'som';
    this.visionApiUrl = flow.vision_api_url;
  }

  private async initializeVisionBackend(): Promise<void> {
    if (!this.globalVisionFallbackEnabled) {
      return;
    }

    try {
      if (this.globalVisionBackendType === 'som') {
        this.visionBackend = new SoMBackend(this.visionApiUrl);
      } else if (this.globalVisionBackendType === 'omniparser') {
        this.visionBackend = new OmniParserBackend(this.visionApiUrl);
      } else {
        throw new Error(`Unknown vision backend type: ${this.globalVisionBackendType}`);
      }

      await this.visionBackend.initialize();
    } catch (error) {
      console.warn(`Vision backend initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      this.visionBackend = undefined;
    }
  }

  private async executeWithVisionFallback(
    step: Step,
    _error: Error
  ): Promise<{ success: boolean; usedVision: boolean; visionConfidence?: number; visionError?: string }> {
    const stepVisionFallbackEnabled = step.vision_fallback ?? this.globalVisionFallbackEnabled;

    if (!stepVisionFallbackEnabled || !this.visionBackend) {
      return { success: false, usedVision: false };
    }

    if (step.action === ActionType.navigate || step.action === ActionType.wait || step.action === ActionType.press) {
      return { success: false, usedVision: false };
    }

    if (!this.page) {
      this.page = this.cdpConnector.getPage();
    }

    const page = this.page;

    try {
      const screenshot = await captureScreenshotForVision(page);
      const prompt = `${step.description}. Target: ${step.target}`;
      const timeoutMs = (step.timeout ?? 30) * 1000;

      const visionPromise = this.visionBackend!.detectElements(screenshot, {
        prompt,
        threshold: 0.5,
        top_k: 1,
        target: step.vision_target,
        ocr_language: step.vision_ocr_language,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new VisionFallbackError(VisionFallbackErrorType.Timeout, `Vision detection timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const results = await Promise.race([visionPromise, timeoutPromise]);

      const visionResult = results?.[0];
      if (!visionResult || !visionResult.success) {
        return {
          success: false,
          usedVision: true,
          visionError: visionResult?.error || 'No elements detected',
        };
      }

      const viewport = page.viewportSize() || { width: 1920, height: 1080 };

      const coordinates = convertVisionToPageCoordinates(
        visionResult.result.bbox,
        Math.sqrt(screenshot.length),
        Math.sqrt(screenshot.length),
        viewport.width,
        viewport.height
      );

      await executeActionAtCoordinates(page, step.action, coordinates, step.value);

      return {
        success: true,
        usedVision: true,
        visionConfidence: visionResult.result.confidence,
      };
    } catch (error) {
      return {
        success: false,
        usedVision: true,
        visionError: error instanceof VisionFallbackError
          ? error.message
          : error instanceof Error
          ? error.message
          : String(error),
      };
    }
  }

  async execute(step: Step, cdpConnector: CDPConnector): Promise<{ success: boolean; usedVision: boolean; visionConfidence?: number; visionError?: string }> {
    await this.initializeVisionBackend();
    this.page = cdpConnector.getPage();

    const page = this.page;

    switch (step.action) {
      case ActionType.navigate:
        await page.goto(step.target);
        break;
      case ActionType.click:
        try {
          await page.locator(step.target).click();
        } catch (error) {
          const result = await this.executeWithVisionFallback(step, error as Error);
          if (result.usedVision) {
            return result;
          }
          throw error;
        }
        break;
      case ActionType.type:
        if (!step.value) {
          throw new Error('Type action requires a value to type');
        }
        try {
          await page.locator(step.target).fill(step.value);
        } catch (error) {
          const result = await this.executeWithVisionFallback(step, error as Error);
          if (result.usedVision) {
            return result;
          }
          throw error;
        }
        break;
      case ActionType.wait:
        await page.waitForTimeout(parseInt(step.target, 10));
        break;
      case ActionType.select:
        if (!step.value) {
          throw new Error('Select action requires a value to select');
        }
        try {
          await page.selectOption(step.target, step.value);
        } catch (error) {
          const result = await this.executeWithVisionFallback(step, error as Error);
          if (result.usedVision) {
            return result;
          }
          throw error;
        }
        break;
      case ActionType.click_at:
        if (!step.coordinates) {
          throw new Error('click_at action requires coordinates {x, y}');
        }
        await page.mouse.click(step.coordinates.x, step.coordinates.y);
        break;
      case ActionType.click_template: {
        let templateImage: Buffer | null = null;
        let templateSource: string;
        
        if (step.template_path) {
          templateImage = await loadTemplateImage(step.template_path);
          templateSource = step.template_path;
        } else if (step.template_data) {
          templateImage = loadTemplateFromBase64(step.template_data);
          templateSource = 'base64-encoded-template';
        } else {
          throw new Error('click_template action requires either template_path or template_data');
        }
        
        if (!templateImage) {
          throw new Error(`Failed to load template from ${templateSource}`);
        }
        
        const screenshot = await captureScreenshotForVision(page);
        const threshold = step.template_threshold ?? 0.8;
        const matchResult = await findTemplate(screenshot, templateImage, threshold);
        
        if (!matchResult) {
          throw new Error(`Template not found on screen: ${templateSource} (threshold: ${threshold})`);
        }
        
        await page.mouse.click(matchResult.x, matchResult.y);
        break;
      }
      case ActionType.press:
        await page.keyboard.press(step.target);
        break;
      case ActionType.loop:
        if (!step.loop_steps || step.loop_steps.length === 0) {
          throw new Error('loop action requires loop_steps array');
        }
        const loopRepeat = step.repeat ?? 1;
        const loopContinueOnError = step.continue_on_error ?? false;
        
        for (let iteration = 1; iteration <= loopRepeat; iteration++) {
          for (const loopStep of step.loop_steps) {
            try {
              const subStep: Step = {
                ...loopStep,
                step_no: step.step_no,
              };
              await this.execute(subStep, cdpConnector);
            } catch (error) {
              if (!loopContinueOnError) {
                throw error;
              }
            }
          }
        }
        break;
      default:
        throw new Error(`Unknown action type: ${step.action}`);
    }

    return { success: true, usedVision: false };
  }
}

async function executeStepAction(page: Page, step: Step): Promise<void> {
  switch (step.action) {
    case ActionType.navigate:
      await page.goto(step.target);
      break;
    case ActionType.click:
      await page.locator(step.target).click();
      break;
    case ActionType.type:
      if (!step.value) {
        throw new Error('Type action requires a value to type');
      }
      await page.locator(step.target).fill(step.value);
      break;
    case ActionType.wait:
      await page.waitForTimeout(parseInt(step.target, 10));
      break;
    case ActionType.select:
      if (!step.value) {
        throw new Error('Select action requires a value to select');
      }
      await page.selectOption(step.target, step.value);
      break;
    case ActionType.click_at:
      if (!step.coordinates) {
        throw new Error('click_at action requires coordinates {x, y}');
      }
      await page.mouse.click(step.coordinates.x, step.coordinates.y);
      break;
    case ActionType.press:
      await page.keyboard.press(step.target);
      break;
    case ActionType.loop:
      throw new Error('loop action requires CDPConnector and cannot be executed directly');
    default:
      throw new Error(`Unknown action type: ${step.action}`);
  }
}

export async function executeStepWithTimeout(page: Page, step: Step, timeoutMs: number): Promise<void> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Step ${step.step_no} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    await Promise.race([
      executeStepAction(page, step),
      timeoutPromise
    ]);
  } catch (error) {
    throw error;
  }
}

export async function handleStep(page: Page, step: Step): Promise<void> {
  const timeoutMs = (step.timeout ?? 30) * 1000;
  await executeStepWithTimeout(page, step, timeoutMs);
}
