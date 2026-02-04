import { test, expect } from '@playwright/test';
import { VisionBackendType, VisionFallbackError, VisionFallbackErrorType, captureScreenshotForVision, convertVisionToPageCoordinates, executeActionAtCoordinates } from '../../src/runner/vision-fallback.js';
import { ActionType } from '../../src/models/flow.js';
import { SoMBackend } from '../../src/runner/vision-som-backend.js';
import { OmniParserBackend } from '../../src/runner/vision-omniparser-backend.js';

test.describe('Vision Fallback Types', () => {
  test('VisionBackendType enum has correct values', () => {
    expect(VisionBackendType.SoM).toBe('som');
    expect(VisionBackendType.OmniParser).toStrictEqual('omniparser');
  });

  test('VisionFallbackErrorType enum has all error types', () => {
    expect(VisionFallbackErrorType.BackendNotAvailable).toBe('BACKEND_NOT_AVAILABLE');
    expect(VisionFallbackErrorType.InitializationFailed).toBe('INITIALIZATION_FAILED');
    expect(VisionFallbackErrorType.DetectionFailed).toBe('DETECTION_FAILED');
    expect(VisionFallbackErrorType.NoElementsFound).toBe('NO_ELEMENTS_FOUND');
    expect(VisionFallbackErrorType.LowConfidence).toBe('LOW_CONFIDENCE');
    expect(VisionFallbackErrorType.Timeout).toBe('TIMEOUT');
    expect(VisionFallbackErrorType.InvalidScreenshot).toBe('INVALID_SCREENSHOT');
  });

  test('VisionFallbackError contains type and message', () => {
    const error = new VisionFallbackError(
      VisionFallbackErrorType.BackendNotAvailable,
      'Backend not available',
      new Error('Original error')
    );

    expect(error.type).toBe(VisionFallbackErrorType.BackendNotAvailable);
    expect(error.message).toBe('Backend not available');
    expect(error.originalError).toBeInstanceOf(Error);
    expect(error.name).toBe('VisionFallbackError');
  });
});

test.describe('SoM Backend', () => {
  test('type property returns SoM', () => {
    const backend = new SoMBackend('http://localhost:6092');
    expect(backend.type).toBe(VisionBackendType.SoM);
  });

  test('isAvailable returns false when backend is unreachable', async () => {
    const backend = new SoMBackend('http://localhost:6092');
    const available = await backend.isAvailable();
    expect(available).toBe(false);
  });

  test('detectElements throws error when not initialized', async () => {
    const backend = new SoMBackend('http://localhost:6092');
    const screenshotBuffer = Buffer.from('fake image');

    await expect(backend.detectElements(screenshotBuffer, { prompt: 'test' }))
      .rejects.toThrow(VisionFallbackError);
  });

  test('setConfidenceThreshold throws error for invalid values', () => {
    const backend = new SoMBackend('http://localhost:6092');
    expect(() => backend.setConfidenceThreshold(-1)).toThrow('Confidence threshold must be between 0 and 1');
    expect(() => backend.setConfidenceThreshold(2)).toThrow('Confidence threshold must be between 0 and 1');
  });

  test('setConfidenceThreshold accepts valid values', () => {
    const backend = new SoMBackend('http://localhost:6092');
    expect(() => backend.setConfidenceThreshold(0)).not.toThrow();
    expect(() => backend.setConfidenceThreshold(0.5)).not.toThrow();
    expect(() => backend.setConfidenceThreshold(1)).not.toThrow();
  });
});

test.describe('OmniParser Backend', () => {
  test('type property returns OmniParser', () => {
    const backend = new OmniParserBackend('http://localhost:8000/parse/');
    expect(backend.type).toBe(VisionBackendType.OmniParser);
  });

  test('isAvailable returns false when backend is unreachable', async () => {
    const backend = new OmniParserBackend('http://localhost:8000/parse/');
    const available = await backend.isAvailable();
    expect(available).toBe(false);
  });

  test('detectElements throws error when not initialized', async () => {
    const backend = new OmniParserBackend('http://localhost:8000/parse/');
    const screenshotBuffer = Buffer.from('fake image');

    await expect(backend.detectElements(screenshotBuffer, { prompt: 'test' }))
      .rejects.toThrow(VisionFallbackError);
  });

  test('setConfidenceThreshold throws error for invalid values', () => {
    const backend = new OmniParserBackend('http://localhost:8000/parse/');
    expect(() => backend.setConfidenceThreshold(-1)).toThrow('Confidence threshold must be between 0 and 1');
    expect(() => backend.setConfidenceThreshold(2)).toThrow('Confidence threshold must be between 0 and 1');
  });

  test('setConfidenceThreshold accepts valid values', () => {
    const backend = new OmniParserBackend('http://localhost:8000/parse/');
    expect(() => backend.setConfidenceThreshold(0)).not.toThrow();
    expect(() => backend.setConfidenceThreshold(0.5)).not.toThrow();
    expect(() => backend.setConfidenceThreshold(1)).not.toThrow();
  });
});

test.describe('Convert Vision to Page Coordinates', () => {
  test('convertVisionToPageCoordinates scales coordinates correctly', () => {
    const visionBbox = { x: 100, y: 100, width: 50, height: 50 };
    const screenshotWidth = 800;
    const screenshotHeight = 600;
    const pageWidth = 1600;
    const pageHeight = 1200;

    const result = convertVisionToPageCoordinates(visionBbox, screenshotWidth, screenshotHeight, pageWidth, pageHeight);

    expect(result.x).toBe(250);
    expect(result.y).toBe(250);
  });

  test('convertVisionToPageCoordinates centers on bounding box', () => {
    const visionBbox = { x: 0, y: 0, width: 100, height: 100 };
    const result = convertVisionToPageCoordinates(visionBbox, 1000, 1000, 2000, 2000);

    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
  });
});

test.describe('Execute Action at Coordinates', () => {
  test('executeActionAtCoordinates throws error for unsupported actions', async () => {
    const mockPage = {} as any;
    const coordinates = { x: 100, y: 200 };

    await expect(executeActionAtCoordinates(mockPage, ActionType.navigate, coordinates))
      .rejects.toThrow('Action navigate not supported with Vision coordinates');
  });

  test('executeActionAtCoordinates throws error when type action has no value', async () => {
    const mockPage = {
      mouse: { click: async () => {} },
    } as any;

    const coordinates = { x: 100, y: 200 };

    await expect(executeActionAtCoordinates(mockPage, ActionType.type, coordinates))
      .rejects.toThrow('Type action requires a value');
  });
});
