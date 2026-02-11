import { Logger } from '@techstark/opencv-js';
import { VisionBackend, VisionBackendType, VisionDetectionOptions, VisionExecutionResult } from './vision-fallback.js';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ParsedVisionResult {
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
}

interface VisionCacheEntry {
  screenKey: string;
  elementKey: string;
  viewport: { width: number; height: number };
  bbox_norm: { x: number; y: number; w: number; h: number };
  last_seen: number;
  confidence: number;
}

class VisionCacheManager {
  private cache: Map<string, VisionCacheEntry> = new Map();
  private readonly CACHE_FILE = path.join(process.cwd(), 'vision_cache.json');

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.CACHE_FILE)) {
        const data = fs.readFileSync(this.CACHE_FILE, 'utf-8');
        const json = JSON.parse(data);
        this.cache = new Map(Object.entries(json));
      }
    } catch (e) {
      console.warn('[VisionCache] Failed to load cache:', e);
    }
  }

  private save() {
    try {
      const obj = Object.fromEntries(this.cache);
      fs.writeFileSync(this.CACHE_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {
      console.warn('[VisionCache] Failed to save cache:', e);
    }
  }

  getKey(screenKey: string, elementKey: string): string {
    return `${screenKey}::${elementKey}`;
  }

  get(screenKey: string, elementKey: string): VisionCacheEntry | undefined {
    const key = this.getKey(screenKey, elementKey);
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    // TTL check removed as requested (infinite persistence)
    return entry;
  }

  set(entry: VisionCacheEntry): void {
    const key = this.getKey(entry.screenKey, entry.elementKey);
    this.cache.set(key, entry);
    this.save();
  }

  delete(screenKey: string, elementKey: string): void {
    const key = this.getKey(screenKey, elementKey);
    this.cache.delete(key);
    this.save();
  }

  /**
   * Updates the confidence score using an Exponential Moving Average (EMA).
   * @param success Whether the verification was successful (1.0) or failed (0.0)
   * @returns true if the entry remains valid (> 0.7), false if invalidated
   */
  updateConfidence(screenKey: string, elementKey: string, success: boolean): boolean {
    const key = this.getKey(screenKey, elementKey);
    const entry = this.cache.get(key);
    if (!entry) return false;

    const alpha = 0.5; // Increased weight for new sample (was 0.3)
    const newSample = success ? 1.0 : 0.0;
    
    // Update EMA
    entry.confidence = (entry.confidence * (1 - alpha)) + (newSample * alpha);
    entry.last_seen = Date.now();

    console.log(`[VisionCache] Updated confidence for "${elementKey}": ${entry.confidence.toFixed(2)} (Success: ${success})`);

    if (entry.confidence < 0.7) {
      console.log(`[VisionCache] Confidence dropped below 0.7. Invalidating cache for "${elementKey}".`);
      this.cache.delete(key);
      this.save();
      return false;
    }

    this.save();
    return true;
  }
}

export class OpenAIVisionBackend implements VisionBackend {
  readonly type = VisionBackendType.OpenAI;
  private apiUrl: string;
  private modelName: string;
  private confidenceThreshold = 0.5;
  private maxTokens = 4096;
  private temperature = 0.1;
  private apiKey: string | undefined;
  private cacheManager = new VisionCacheManager();

  constructor(
    apiUrl: string = 'http://localhost:3000/v1',
    modelName: string = 'NCSOFT/VARCO-VISION-2.0-1.7B-OCR',
    apiKey?: string
  ) {
    this.apiUrl = apiUrl.replace(/\/$/, '').replace('localhost', '127.0.0.1');
    this.modelName = modelName;
    this.apiKey = apiKey;
  }

  private getModelsUrl(): string {
    return this.apiUrl.endsWith('/v1') ? `${this.apiUrl}/models` : `${this.apiUrl}/v1/models`;
  }

  private getChatCompletionUrl(): string {
    return this.apiUrl.endsWith('/v1') ? `${this.apiUrl}/chat/completions` : `${this.apiUrl}/v1/chat/completions`;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
      
      const modelsUrl = this.getModelsUrl();
      console.log(`[OpenAI Vision] Checking availability at: ${modelsUrl}`);
      const response = await fetch(modelsUrl, { method: 'GET', headers });
      console.log(`[OpenAI Vision] Availability check response: ${response.status} ${response.statusText}`);
      return response.ok;
    } catch (error) {
      console.error(`[OpenAI Vision] isAvailable check failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async initialize(): Promise<void> {
    // Initialization logic if needed
  }

  private async processImage(buffer: Buffer, options: { resize?: { width: number }, grayscale?: boolean, crop?: { left: number, top: number, width: number, height: number } }): Promise<Buffer> {
    try {
      // Dynamic import to avoid crash if sharp is missing (e.g. standalone binaries)
      const sharpModule = await import('sharp');
      const sharp = sharpModule.default || sharpModule;
      // @ts-ignore
      let pipeline = sharp(buffer);

      if (options.crop) {
        pipeline = pipeline.extract(options.crop);
      }

      if (options.resize) {
        pipeline = pipeline.resize({ width: options.resize.width, withoutEnlargement: true });
      }

      if (options.grayscale) {
        pipeline = pipeline.grayscale();
      }

      return await pipeline.toBuffer();
    } catch (error) {
      if (options.crop) {
        throw new Error(`Cropping requires 'sharp' module which is not available: ${error}`);
      }
      console.warn(`[OpenAI Vision] Image optimization failed (sharp not available), using original image.`);
      return buffer;
    }
  }

  async detectElements(
    screenshotBuffer: Buffer,
    options: VisionDetectionOptions
  ): Promise<VisionExecutionResult[]> {
    const startTime = Date.now();
    const artifactsDir = path.join(process.cwd(), 'artifacts', 'vision-debug');
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Basic metadata
    const png = PNG.sync.read(screenshotBuffer);
    const imgWidth = png.width;
    const imgHeight = png.height;
    
    const screenKey = options.screenHint || "default_screen"; 
    const elementKey = options.target || "unknown_element";

    // 1. FAST PATH: Check Cache
    const cacheEntry = this.cacheManager.get(screenKey, elementKey);

    if (cacheEntry && options.target) {
      // Check if aspect ratio changed significantly (> 10%)
      const currentAspect = imgWidth / imgHeight;
      const cachedAspect = cacheEntry.viewport.width / cacheEntry.viewport.height;
      const ratioDiff = Math.abs(currentAspect - cachedAspect) / cachedAspect;
      
      const aspectChanged = ratioDiff > 0.1;

      if (aspectChanged) {
        console.log(`\n⚠️ [OpenAI Vision] Viewport aspect ratio changed significantly (${cachedAspect.toFixed(2)} -> ${currentAspect.toFixed(2)}, diff: ${(ratioDiff*100).toFixed(1)}%). Skipping Fast Path to re-calibrate.`);
        // Don't use cache, force Slow Path to update coordinates
      } else {
        console.log(`\n⚡ [OpenAI Vision] Cache HIT for "${elementKey}". Attempting Fast Path...`);
        
        const padding = 50; 
        let roiX = Math.floor(cacheEntry.bbox_norm.x * imgWidth) - padding;
        let roiY = Math.floor(cacheEntry.bbox_norm.y * imgHeight) - padding;
        let roiW = Math.floor(cacheEntry.bbox_norm.w * imgWidth) + (padding * 2);
        let roiH = Math.floor(cacheEntry.bbox_norm.h * imgHeight) + (padding * 2);

        roiX = Math.max(0, roiX);
        roiY = Math.max(0, roiY);
        roiW = Math.min(imgWidth - roiX, roiW);
        roiH = Math.min(imgHeight - roiY, roiH);

        if (roiW > 0 && roiH > 0) {
          try {
            const croppedBuffer = await this.processImage(screenshotBuffer, {
              crop: { left: roiX, top: roiY, width: roiW, height: roiH }
            });

            console.log(`   Verifying ROI: ${roiX},${roiY} ${roiW}x${roiH}`);
            const debugPath = path.join(artifactsDir, `vision-${timestamp}-roi.png`);
            fs.writeFileSync(debugPath, croppedBuffer);

            const verifyPrompt = `Does the image contain the element "${options.target}"? If yes, return its bounding box as JSON { "found": true, "bbox": [x, y, w, h] } where coordinates are relative to this image snippet. If no, return { "found": false }.`;
            
            const verificationResult = await this.callVisionAPI(croppedBuffer, verifyPrompt);
            console.log(`   Verification API response: ${verificationResult}`);
            let verified = false;
            let localBbox = null;
            
            try {
              const jsonMatch = verificationResult.match(/\{.*\}/s);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.found) {
                  verified = true;
                  localBbox = parsed.bbox;
                }
              }
            } catch (e) {
              // Ignore parsing error
            }

            if (!verified) {
               const parsed = this.parseVisionResults(verificationResult, roiW, roiH, options.target);
               const targetMatch = parsed.find(p => (options.target && p.text.includes(options.target)) || p.confidence > 0.8);
               if (targetMatch) {
                 verified = true;
                 localBbox = [targetMatch.bbox.x, targetMatch.bbox.y, targetMatch.bbox.width, targetMatch.bbox.height];
               }
            }

            if (verified && localBbox) {
              console.log(`\n✅ [OpenAI Vision] Fast Path SUCCESS. Element verified in ROI.`);
              
              const lx = Array.isArray(localBbox) ? localBbox[0] : localBbox.x;
              const ly = Array.isArray(localBbox) ? localBbox[1] : localBbox.y;
              const lw = Array.isArray(localBbox) ? localBbox[2] : localBbox.width;
              const lh = Array.isArray(localBbox) ? localBbox[3] : localBbox.height;

              let pixelX = lx;
              let pixelY = ly;
              let pixelW = lw;
              let pixelH = lh;

              if (lx <= 1.0 && ly <= 1.0 && lw <= 1.0 && lh <= 1.0) {
                pixelX = lx * roiW;
                pixelY = ly * roiH;
                pixelW = lw * roiW;
                pixelH = lh * roiH;
              }

              const globalX = roiX + pixelX;
              const globalY = roiY + pixelY;
              const globalW = pixelW;
              const globalH = pixelH;

              this.cacheManager.updateConfidence(screenKey, elementKey, true);

              const updatedEntry = this.cacheManager.get(screenKey, elementKey);
              const finalConfidence = updatedEntry ? updatedEntry.confidence : 0.95;

              if (updatedEntry) {
                   updatedEntry.bbox_norm = {
                      x: globalX / imgWidth, 
                      y: globalY / imgHeight, 
                      w: globalW / imgWidth, 
                      h: globalH / imgHeight 
                   };
                   this.cacheManager.set(updatedEntry);
              }

              return [{
                result: {
                  bbox: { x: globalX, y: globalY, width: globalW, height: globalH },
                  confidence: finalConfidence, 
                  label: options.target,
                  element_id: `cached_${options.target}`
                },
                success: true,
                processing_time_ms: Date.now() - startTime,
                backend: this.type
              }];
            } else {
              console.log(`\n⚠️ [OpenAI Vision] Fast Path FAILED. Element not found in ROI. Falling back to full search.`);
              this.cacheManager.updateConfidence(screenKey, elementKey, false);
            }

          } catch (error) {
            console.error(`   Fast Path error: ${error}. Fallback to slow path.`);
          }
        }
      }
    }

    // 2. SLOW PATH: Full Search with Optimization
    console.log('\n🔍 [OpenAI Vision] Starting full element detection (Slow Path)...');

    let processedBuffer = screenshotBuffer;
    try {
      processedBuffer = await this.processImage(screenshotBuffer, {
        resize: { width: 960 }, // Increased resolution to FHD
        grayscale: true          // Keep color for better accuracy
      });
      console.log(`   Image optimized: Resized (max 1920px)`);
    } catch (e) {
      console.warn(`   Image optimization failed, using original. Error: ${e}`);
    }

    const screenshotPath = path.join(artifactsDir, `vision-${timestamp}-optimized.png`);
    fs.writeFileSync(screenshotPath, processedBuffer);
    console.log(`   Debug image saved: ${screenshotPath}`);

    const optPng = PNG.sync.read(processedBuffer);
    const optWidth = optPng.width;
    const optHeight = optPng.height;
    
    const scaleX = imgWidth / optWidth;
    const scaleY = imgHeight / optHeight;

    try {
      const apiPrompt = options.prompt || `"${options.target}"`;
      const visionText = await this.callVisionAPI(processedBuffer, apiPrompt);

      const responsePath = path.join(artifactsDir, `vision-${timestamp}-response.txt`);
      fs.writeFileSync(responsePath, visionText);

      const parsedResults = this.parseVisionResults(visionText, optWidth, optHeight, options.target);
      
      console.log(`\n📊 [OpenAI Vision] Parsed ${parsedResults.length} element(s)`);

      let filteredResults = parsedResults.filter(r => r.confidence >= this.confidenceThreshold);
      if (options.target) {
        const targetText = options.target.toLowerCase();
        filteredResults = filteredResults.filter(r => r.text.toLowerCase().includes(targetText));
      }

      if (filteredResults.length === 0) {
        return [{
          result: { bbox: { x: 0, y: 0, width: 0, height: 0 }, confidence: 0, label: '', element_id: '' },
          success: false,
          error: 'No elements found matching criteria',
          processing_time_ms: Date.now() - startTime,
          backend: this.type
        }];
      }

      const target = options.target;
      const finalResults: VisionExecutionResult[] = filteredResults.map(r => {
        const globalBbox = {
          x: r.bbox.x * scaleX,
          y: r.bbox.y * scaleY,
          width: r.bbox.width * scaleX,
          height: r.bbox.height * scaleY
        };

        // Cache the best match
        if (target && r.text.toLowerCase().includes(target.toLowerCase())) {
          // Do NOT cache if it's the fallback whole-screen match
          const isWholeScreen = globalBbox.width >= imgWidth * 0.9 && globalBbox.height >= imgHeight * 0.9;
          
          if (!isWholeScreen) {
            this.cacheManager.set({
              screenKey,
              elementKey,
              viewport: { width: imgWidth, height: imgHeight },
              bbox_norm: { 
                x: globalBbox.x / imgWidth, 
                y: globalBbox.y / imgHeight, 
                w: globalBbox.width / imgWidth, 
                h: globalBbox.height / imgHeight 
              },
              last_seen: Date.now(),
              confidence: r.confidence
            });
            console.log(`   Cached location for "${elementKey}"`);
          } else {
             console.log(`   Skipping cache for "${elementKey}" (Whole screen fallback)`);
          }
        }

        return {
          result: {
            bbox: globalBbox,
            confidence: r.confidence,
            label: r.text,
            element_id: `openai_${r.text.substring(0, 20).replace(/\s+/g, '_')}`
          },
          success: true,
          processing_time_ms: Date.now() - startTime,
          backend: this.type
        };
      });

      return finalResults;

    } catch (error) {
      console.error(`\n❌ [OpenAI Vision] Error: ${error}`);
      return [{
        result: { bbox: { x: 0, y: 0, width: 0, height: 0 }, confidence: 0, label: '', element_id: '' },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processing_time_ms: Date.now() - startTime,
        backend: this.type
      }];
    }
  }

  private async callVisionAPI(imageBuffer: Buffer, _promptText: string): Promise<string> {
    const base64Image = imageBuffer.toString('base64');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const requestBody = {
      model: this.modelName,
      messages: [
        {
          role: 'user',
          content: [
            { "type": "text", "text": "<ocr>" },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
          ]
        }
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature
    };

    const chatUrl = this.getChatCompletionUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    console.log(`[OpenAI Vision] Sending request body "${JSON.stringify(requestBody).substring(0, 1000)}..." to ${chatUrl}`);

    try {
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      console.log(`[OpenAI Vision] API response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`Status ${response.status}: ${await response.text()}`);
      }

      const result = await response.json() as OpenAIResponse;
      if (!result.choices || result.choices.length === 0) {
        throw new Error('No choices in response');
      }
      const choice = result.choices[0];
      if (!choice || !choice.message) {
         throw new Error('Invalid choice in response');
      }
      return choice.message.content;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Parse vision text output from OpenAI-compatible model
   * Expected formats:
   * - "Text: [content] at (x, y, width, height) confidence: 0.95"
   * - "TextContent0.371, 0.095, 0.411, 0.107" (VARCO-VISION format)
   * - JSON format with bbox coordinates
   */
  private parseVisionResults(visionText: string, imgWidth: number, imgHeight: number, _targetText?: string): ParsedVisionResult[] {
    const results: ParsedVisionResult[] = [];

    // Try to parse as JSON first
    try {
      const jsonData = JSON.parse(visionText);
      const items = Array.isArray(jsonData) ? jsonData : [jsonData];
      
      items.forEach((item: any) => {
        if (item.bbox || item.x) {
             results.push({
                text: item.text || item.content || item.label || '',
                bbox: {
                  x: item.bbox?.[0] || item.x || 0,
                  y: item.bbox?.[1] || item.y || 0,
                  width: (item.bbox?.[2] || item.width || 0) - (item.bbox?.[0] || item.x || 0), // If [x1, y1, x2, y2]
                  height: (item.bbox?.[3] || item.height || 0) - (item.bbox?.[1] || item.y || 0),
                },
                confidence: item.confidence || 0.8,
              });
        }
      });
      if (results.length > 0) return results;
    } catch {
      // Not JSON, parse as text
    }

    // Parse VARCO-VISION format: "TextContent0.371, 0.095, 0.411, 0.107"
    // Pattern: text followed by 4 numbers (x1, y1, x2, y2)
    const lines = visionText.split('\n');
    
    // VARCO format: text immediately followed by coordinates
    const varcoPattern = /^.*?"?([^"\d][^"]*?)"?\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)$/;
    
    // Standard format: "Text: ... at (x, y, width, height) confidence: ..."
    const standardPattern = /Text:\s*"?([^"]+)"?.*?(?:at|@)\s*\(?([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\)?.*?confidence[:\s]+([\d.]+)/i;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Try VARCO format first
      const varcoMatch = trimmedLine.match(varcoPattern);
      if (varcoMatch) {
        const [, textMatch, x1, y1, x2, y2] = varcoMatch;
        if (textMatch && x1 && y1 && x2 && y2) {
          let cleanText = textMatch.trim();
          const promptArtifacts = [
            'Click non-existent link to trigger OpenAI Vision fallback.',
            'Target: a#non-existent-link-for-openai-test',
            'Find element containing text:',
            '<ocr>',
          ];
          for (const artifact of promptArtifacts) {
            cleanText = cleanText.replace(artifact, '');
          }
          cleanText = cleanText.replace(/^["']|["']$/g, '').trim();
          
          if (!cleanText) continue;
          
          results.push({
            text: cleanText,
            bbox: {
              x: parseFloat(x1) * imgWidth,
              y: parseFloat(y1) * imgHeight,
              width: (parseFloat(x2) - parseFloat(x1)) * imgWidth,
              height: (parseFloat(y2) - parseFloat(y1)) * imgHeight,
            },
            confidence: 0.8, 
          });
          continue;
        }
      }

      // Try standard format
      const standardMatch = trimmedLine.match(standardPattern);
      if (standardMatch) {
        const [, textMatch, x, y, width, height, confidence] = standardMatch;
        if (textMatch && x && y && width && height && confidence) {
          let bboxX = parseFloat(x);
          let bboxY = parseFloat(y);
          let bboxW = parseFloat(width);
          let bboxH = parseFloat(height);

          // If coordinates are normalized (<= 1), scale them
          if (bboxX <= 1 && bboxY <= 1 && bboxW <= 1 && bboxH <= 1) {
            bboxX *= imgWidth;
            bboxY *= imgHeight;
            // Assuming width/height are relative dimensions if normalized
            // But if x2/y2, we need subtract. 
            // Standardizing on x,y,w,h here for simplicity
            bboxW *= imgWidth; 
            bboxH *= imgHeight;
          }

          results.push({
            text: textMatch.trim(),
            bbox: {
              x: bboxX,
              y: bboxY,
              width: bboxW,
              height: bboxH,
            },
            confidence: parseFloat(confidence),
          });
        }
      }
    }

    console.log(`   Parsed ${results.length} elements from OCR text`);
    if (results.length > 0) {
      results.forEach((r, i) => {
        console.log(`     [${i}] "${r.text}" at (${r.bbox.x.toFixed(0)}, ${r.bbox.y.toFixed(0)}, ${(r.bbox.x + r.bbox.width).toFixed(0)}, ${(r.bbox.y + r.bbox.height).toFixed(0)})`);
      });
    }

    // If no structured results found, treat entire text as single result
    if (results.length === 0 && visionText.trim()) {
      results.push({
        text: visionText.trim(),
        bbox: { x: 0, y: 0, width: imgWidth, height: imgHeight },
        confidence: 0.5,
      });
    }

    return results;
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

  getModelName(): string {
    return this.modelName;
  }

  setModelName(modelName: string): void {
    this.modelName = modelName;
  }

  getMaxTokens(): number {
    return this.maxTokens;
  }

  setMaxTokens(maxTokens: number): void {
    this.maxTokens = maxTokens;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  setApiKey(apiKey: string | undefined): void {
    this.apiKey = apiKey;
  }
}

