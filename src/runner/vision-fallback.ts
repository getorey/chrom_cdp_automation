import { Page } from 'playwright';
import { ActionType } from '../models/flow.js';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisionResult {
  bbox: BoundingBox;
  confidence: number;
  label?: string;
  element_id?: string;
}

export interface VisionDetectionOptions {
  prompt: string;
  threshold?: number;
  top_k?: number;
  target?: string | undefined;
  ocr_language?: string | undefined;
}

export interface VisionExecutionResult {
  result: VisionResult;
  success: boolean;
  error?: string;
  processing_time_ms: number;
  backend: VisionBackendType;
}

export enum VisionBackendType {
  SoM = 'som',
  OmniParser = 'omniparser',
  OpenAI = 'openai',
}

export interface VisionBackend {
  readonly type: VisionBackendType;

  isAvailable(): Promise<boolean>;
  initialize(): Promise<void>;

  detectElements(
    screenshotBuffer: Buffer,
    options: VisionDetectionOptions
  ): Promise<VisionExecutionResult[]>;

  getConfidenceThreshold(): number;
  setConfidenceThreshold(threshold: number): void;
}

export interface VisionFallbackConfig {
  enabled: boolean;
  backend: VisionBackendType;
  confidence_threshold: number;
  timeout_ms: number;
}

export enum VisionFallbackErrorType {
  BackendNotAvailable = 'BACKEND_NOT_AVAILABLE',
  InitializationFailed = 'INITIALIZATION_FAILED',
  DetectionFailed = 'DETECTION_FAILED',
  NoElementsFound = 'NO_ELEMENTS_FOUND',
  LowConfidence = 'LOW_CONFIDENCE',
  Timeout = 'TIMEOUT',
  InvalidScreenshot = 'INVALID_SCREENSHOT',
}

export class VisionFallbackError extends Error {
  constructor(
    public readonly type: VisionFallbackErrorType,
    message: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'VisionFallbackError';
  }
}

export interface ScreenshotCaptureOptions {
  fullPage?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
}

export async function captureScreenshotForVision(
  page: Page,
  options: ScreenshotCaptureOptions = {}
): Promise<Buffer> {
  const screenshotOptions: any = {
    type: 'png',
    fullPage: options.fullPage ?? false,
  };
  if (options.clip) {
    screenshotOptions.clip = options.clip;
  }
  const screenshot = await page.screenshot(screenshotOptions);
  return screenshot;
}

export function convertVisionToPageCoordinates(
  visionBbox: BoundingBox,
  screenshotWidth: number,
  screenshotHeight: number,
  pageWidth: number,
  pageHeight: number,
  cropOffset: { x: number; y: number } = { x: 0, y: 0 }
): { x: number; y: number } {
  const scaleX = pageWidth / screenshotWidth;
  const scaleY = pageHeight / screenshotHeight;

  // Calculate center coordinates in the cropped image
  const centerX = visionBbox.x * scaleX + visionBbox.width * scaleX / 2;
  const centerY = visionBbox.y * scaleY + visionBbox.height * scaleY / 2;

  // Add crop offset to get page coordinates
  return {
    x: Math.round(centerX + cropOffset.x),
    y: Math.round(centerY + cropOffset.y),
  };
}

export async function executeActionAtCoordinates(
  page: Page,
  action: ActionType,
  coordinates: { x: number; y: number },
  value?: string
): Promise<void> {
  switch (action) {
    case ActionType.click:
      await page.mouse.click(coordinates.x, coordinates.y);
      break;
    case ActionType.type:
      if (!value) {
        throw new Error('Type action requires a value');
      }
      await page.mouse.click(coordinates.x, coordinates.y);
      await page.keyboard.type(value);
      break;
    default:
      throw new Error(`Action ${action} not supported with Vision coordinates. Only click and type are supported.`);
  }
}
