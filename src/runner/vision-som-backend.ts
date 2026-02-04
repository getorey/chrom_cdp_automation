import { VisionBackend, VisionBackendType, VisionDetectionOptions, VisionExecutionResult, VisionFallbackError, VisionFallbackErrorType } from './vision-fallback.js';

export class SoMBackend implements VisionBackend {
  readonly type = VisionBackendType.SoM;
  private initialized = false;
  private apiUrl: string;
  private confidenceThreshold = 0.5;

  constructor(apiUrl: string = 'http://localhost:6092') {
    this.apiUrl = apiUrl;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/probe`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async initialize(): Promise<void> {
    if (await this.isAvailable()) {
      this.initialized = true;
    } else {
      throw new VisionFallbackError(
        VisionFallbackErrorType.BackendNotAvailable,
        `SoM backend not available at ${this.apiUrl}. Please ensure that SoM Gradio server is running. Reference: https://github.com/microsoft/SoM`
      );
    }
  }

  async detectElements(
    screenshotBuffer: Buffer,
    _options: VisionDetectionOptions
  ): Promise<VisionExecutionResult[]> {
    if (!this.initialized) {
      throw new VisionFallbackError(
        VisionFallbackErrorType.InitializationFailed,
        'SoM backend not initialized. Call initialize() first.'
      );
    }

    const base64Image = screenshotBuffer.toString('base64');

    try {
      const startTime = Date.now();

      const response = await fetch(`${this.apiUrl}/inference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          background: base64Image,
          slider: 2.5,
          mode: 'Automatic',
          alpha: 0.5,
          label_mode: 'Number',
          anno_mode: ['Mark'],
        }),
      });

      if (!response.ok) {
        throw new VisionFallbackError(
          VisionFallbackErrorType.DetectionFailed,
          `SoM inference failed with status ${response.status}`
        );
      }

      const result = await response.json();
      const processingTimeMs = Date.now() - startTime;

      if (!result || (result as any)[0] === undefined) {
        return [{
          result: {
            bbox: { x: 0, y: 0, width: 0, height: 0 },
            confidence: 0,
            label: '',
            element_id: '',
          },
          success: false,
          error: 'No elements detected by SoM',
          processing_time_ms: processingTimeMs,
          backend: this.type,
        }];
      }

      const visionResults: VisionExecutionResult[] = [
        {
          result: {
            bbox: { x: 0, y: 0, width: 0, height: 0 },
            confidence: 1.0,
            label: 'SoM marked image',
            element_id: 'som_image',
          },
          success: true,
          processing_time_ms: processingTimeMs,
          backend: this.type,
        },
      ];

      return visionResults;
    } catch (error) {
      return [{
        result: {
          bbox: { x: 0, y: 0, width: 0, height: 0 },
          confidence: 0,
          label: '',
          element_id: '',
        },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown SoM error',
        processing_time_ms: 0,
        backend: this.type,
      }];
    }
  }

  getConfidenceThreshold(): number {
    return this.confidenceThreshold;
  }

  setConfidenceThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Confidence threshold must be between 0 and 1');
    }
    this.confidenceThreshold = threshold;
  }
}
