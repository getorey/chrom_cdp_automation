import { Page } from 'playwright';
import { CDPConnector } from './cdp-connector.js';
import { Step, ActionType, Flow } from '../models/flow.js';
import { VisionBackend, VisionFallbackError, VisionFallbackErrorType, captureScreenshotForVision, convertVisionToPageCoordinates, executeActionAtCoordinates } from './vision-fallback.js';
import { SoMBackend } from './vision-som-backend.js';
import { OmniParserBackend } from './vision-omniparser-backend.js';
import { OpenAIVisionBackend } from './vision-openai-backend.js';
import { findTemplate, loadTemplateImage, loadTemplateFromBase64 } from './template-matcher-no-sharp.js';
import { PNG } from 'pngjs';

export class StepHandler {
  private visionBackend: VisionBackend | undefined;
  private globalVisionFallbackEnabled = false;
  private globalVisionBackendType: 'som' | 'omniparser' | 'openai' = 'som';
  private visionApiUrl: string | undefined;
  private visionModelName: string | undefined;
  private visionMaxTokens: number | undefined;
  private visionApiKey: string | undefined;
  private page: Page | null = null;

  constructor(
    flow: Flow,
    private cdpConnector: CDPConnector
  ) {
    this.globalVisionFallbackEnabled = flow.vision_fallback ?? false;
    this.globalVisionBackendType = flow.vision_backend ?? 'som';
    this.visionApiUrl = flow.vision_api_url;
    this.visionModelName = flow.vision_model_name;
    this.visionMaxTokens = flow.vision_max_tokens;
    this.visionApiKey = flow.vision_api_key;
  }

  /**
   * Normalize URL to use only hostname + pathname for consistent cache keys.
   * Removes query parameters, hash fragments, and session IDs.
   */
  private normalizeScreenHint(url: string): string {
    try {
      const parsed = new URL(url);
      // Use only hostname and pathname for stable cache key
      // This ignores query params, hash, port, protocol, and session IDs
      return `${parsed.hostname}${parsed.pathname}`;
    } catch {
      // Fallback to original URL if parsing fails
      return url;
    }
  }

  private async initializeVisionBackend(step?: Step): Promise<void> {
    const shouldInitialize = (step?.vision_fallback) ?? this.globalVisionFallbackEnabled;
    
    if (!shouldInitialize) {
      return;
    }

    if (this.visionBackend) {
      return;
    }

    try {
      if (this.globalVisionBackendType === 'som') {
        this.visionBackend = new SoMBackend(this.visionApiUrl);
      } else if (this.globalVisionBackendType === 'omniparser') {
        this.visionBackend = new OmniParserBackend(this.visionApiUrl);
      } else if (this.globalVisionBackendType === 'openai') {
        const backend = new OpenAIVisionBackend(this.visionApiUrl, this.visionModelName, this.visionApiKey);
        if (this.visionMaxTokens) {
          backend.setMaxTokens(this.visionMaxTokens);
        }
        this.visionBackend = backend;
      } else {
        throw new Error(`Unknown vision backend type: ${this.globalVisionBackendType}`);
      }

      await this.visionBackend.initialize();
      console.log(`[Vision Backend] Initialized ${this.globalVisionBackendType} backend`);
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
      // Get actual viewport size from the page context
      const actualViewport = await page.evaluate<{ width: number; height: number }>('({ width: window.innerWidth, height: window.innerHeight })');

      // Calculate clip area if vision_crop is provided
      let clip: { x: number; y: number; width: number; height: number } | undefined;
      const cropOffset = { x: 0, y: 0 };

      if (step.vision_crop) {
        const { left = 0, top = 0, right = 0, bottom = 0 } = step.vision_crop;
        
        // Convert percentage to pixels
        const x = Math.round((left / 100) * actualViewport.width);
        const y = Math.round((top / 100) * actualViewport.height);
        const width = Math.round(((100 - right - left) / 100) * actualViewport.width);
        const height = Math.round(((100 - bottom - top) / 100) * actualViewport.height);

        // Ensure valid dimensions
        if (width > 0 && height > 0) {
          clip = { x, y, width, height };
          cropOffset.x = x;
          cropOffset.y = y;
          console.log(`[Vision Fallback] Cropping screenshot: x=${x}, y=${y}, w=${width}, h=${height} (Viewport: ${actualViewport.width}x${actualViewport.height})`);
        } else {
          console.warn(`[Vision Fallback] Invalid crop dimensions calculated: w=${width}, h=${height}. Ignoring crop.`);
        }
      }

      const screenshot = await captureScreenshotForVision(page, clip ? { clip } : {});
      const prompt = `${step.description}. Target: ${step.target}`;
      const timeoutMs = (step.timeout ?? 30) * 1000;

      const visionPromise = this.visionBackend!.detectElements(screenshot, {
        prompt,
        threshold: 0.5,
        top_k: 1,
        target: step.vision_target,
        ocr_language: step.vision_ocr_language,
        screenHint: this.normalizeScreenHint(page.url()),
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

      // Parse screenshot to get actual dimensions
      const png = PNG.sync.read(screenshot);
      const screenshotWidth = png.width;
      const screenshotHeight = png.height;

      const coordinates = convertVisionToPageCoordinates(
        visionResult.result.bbox,
        screenshotWidth,
        screenshotHeight,
        clip ? clip.width : actualViewport.width,
        clip ? clip.height : actualViewport.height,
        cropOffset
      );

      console.log(`[Vision Fallback] Clicking at calculated coordinates: (${coordinates.x}, ${coordinates.y}) (Vision bbox: ${JSON.stringify(visionResult.result.bbox)})`);

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
    await this.initializeVisionBackend(step);
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
        
        console.log(`[TemplateMatcher] Clicking at coordinates: (${matchResult.x}, ${matchResult.y})`);
        
        // Ensure the page is focused and handle potential overlay issues by forcing the click
        await page.mouse.click(matchResult.x, matchResult.y);
        
        // Optional: wait a bit after click
        await page.waitForTimeout(500);
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
      case ActionType.wait_for_popup:
        console.log(`[TabManager] Waiting for popup (timeout: ${step.timeout ?? 5000}ms)...`);
        const popupPage = await this.cdpConnector.waitForPopup(step.timeout ?? 5000);
        await this.cdpConnector.connect(popupPage);
        console.log(`[TabManager] Popup detected and connected: ${await popupPage.title()}`);
        break;
      case ActionType.switch_to_tab:
        if (step.tab_index !== undefined) {
          console.log(`[TabManager] Switching to tab by index: ${step.tab_index}`);
          await this.cdpConnector.switchToTabByIndex(step.tab_index);
        } else if (step.tab_title) {
          console.log(`[TabManager] Switching to tab by title: "${step.tab_title}"`);
          await this.cdpConnector.switchToTabByTitle(step.tab_title);
        } else {
          throw new Error('switch_to_tab action requires tab_index or tab_title');
        }
        break;
      case ActionType.close_tab:
        console.log(`[TabManager] Closing current tab (return_to_previous: ${step.return_to_previous ?? false})`);
        await this.cdpConnector.closeTab(step.return_to_previous ?? false);
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
