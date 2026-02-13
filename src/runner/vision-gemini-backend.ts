import { VisionBackend, VisionBackendType, VisionDetectionOptions, VisionExecutionResult } from './vision-fallback.js';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { getCachePath } from '../config/index.js';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message: string;
    code: number;
  };
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
  private readonly CACHE_FILE: string;

  constructor() {
    const cacheDir = getCachePath();
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    this.CACHE_FILE = path.join(cacheDir, 'vision_cache_gemini.json');
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
      console.warn('[GeminiVisionCache] Failed to load cache:', e);
    }
  }

  private save() {
    try {
      const obj = Object.fromEntries(this.cache);
      fs.writeFileSync(this.CACHE_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {
      console.warn('[GeminiVisionCache] Failed to save cache:', e);
    }
  }

  getKey(screenKey: string, elementKey: string): string {
    return `${screenKey}::${elementKey}`;
  }

  get(screenKey: string, elementKey: string): VisionCacheEntry | undefined {
    const key = this.getKey(screenKey, elementKey);
    const entry = this.cache.get(key);
    if (!entry) return undefined;
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

  updateConfidence(screenKey: string, elementKey: string, success: boolean): boolean {
    const key = this.getKey(screenKey, elementKey);
    const entry = this.cache.get(key);
    if (!entry) return false;

    const alpha = 0.5;
    const newSample = success ? 1.0 : 0.0;
    entry.confidence = (entry.confidence * (1 - alpha)) + (newSample * alpha);
    entry.last_seen = Date.now();

    console.log(`[GeminiVisionCache] Updated confidence for "${elementKey}": ${entry.confidence.toFixed(2)} (Success: ${success})`);

    if (entry.confidence < 0.7) {
      console.log(`[GeminiVisionCache] Confidence dropped below 0.7. Invalidating cache for "${elementKey}".`);
      this.cache.delete(key);
      this.save();
      return false;
    }

    this.save();
    return true;
  }
}

export class GeminiVisionBackend implements VisionBackend {
  readonly type = VisionBackendType.Gemini;
  private apiUrl: string;
  private modelName: string;
  private confidenceThreshold = 0.5;
  private maxTokens = 4096;
  private temperature = 0.1;
  private apiKey: string | undefined;
  private cacheManager = new VisionCacheManager();

  constructor(
    apiUrl: string = 'https://generativelanguage.googleapis.com/v1beta',
    modelName: string = 'gemini-2.0-flash',
    apiKey?: string
  ) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.modelName = modelName;
    this.apiKey = apiKey;
  }

  private getModelUrl(): string {
    return `${this.apiUrl}/models/${this.modelName}:generateContent?key=${this.apiKey}`;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      console.error('[Gemini Vision] API key not configured');
      return false;
    }
    try {
      const modelsUrl = `${this.apiUrl}/models?key=${this.apiKey}`;
      console.log(`[Gemini Vision] Checking availability at: ${this.apiUrl}`);
      const response = await fetch(modelsUrl, { method: 'GET' });
      console.log(`[Gemini Vision] Availability check response: ${response.status} ${response.statusText}`);
      return response.ok;
    } catch (error) {
      console.error(`[Gemini Vision] isAvailable check failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async initialize(): Promise<void> {
    // Initialization logic if needed
  }

  private async processImage(buffer: Buffer, options: { resize?: { width: number }, grayscale?: boolean, crop?: { left: number, top: number, width: number, height: number } }): Promise<Buffer> {
    if (options.crop) {
      try {
        const png = PNG.sync.read(buffer);
        const crop = options.crop;
        const cropLeft = Math.max(0, Math.min(crop.left!, png.width));
        const cropTop = Math.max(0, Math.min(crop.top!, png.height));
        const cropWidth = Math.min(crop.width!, png.width - cropLeft);
        const cropHeight = Math.min(crop.height!, png.height - cropTop);
        
        if (cropWidth <= 0 || cropHeight <= 0) {
          console.warn(`[Gemini Vision] Invalid crop dimensions, using original image.`);
          return buffer;
        }
        
        const croppedPng = new PNG({ width: cropWidth, height: cropHeight });
        
        for (let y = 0; y < cropHeight; y++) {
          for (let x = 0; x < cropWidth; x++) {
            const srcIdx = ((cropTop + y) * png.width + (cropLeft + x)) * 4;
            const dstIdx = (y * cropWidth + x) * 4;
            croppedPng.data[dstIdx] = png.data[srcIdx]!;
            croppedPng.data[dstIdx + 1] = png.data[srcIdx + 1]!;
            croppedPng.data[dstIdx + 2] = png.data[srcIdx + 2]!;
            croppedPng.data[dstIdx + 3] = png.data[srcIdx + 3]!;
          }
        }
        
        return PNG.sync.write(croppedPng);
      } catch (error) {
        console.warn(`[Gemini Vision] PNG cropping failed: ${error}. Using original image.`);
        return buffer;
      }
    }
    
    if (options.resize || options.grayscale) {
      try {
        const sharpModule = await import('sharp');
        const sharp = sharpModule.default || sharpModule;
        let pipeline = sharp(buffer);

        if (options.resize) {
          pipeline = pipeline.resize({ width: options.resize.width, withoutEnlargement: true });
        }

        if (options.grayscale) {
          pipeline = pipeline.grayscale();
        }

        return await pipeline.toBuffer();
      } catch (error) {
        console.warn(`[Gemini Vision] Image optimization failed (sharp not available), using original image.`);
        return buffer;
      }
    }
    
    return buffer;
  }

  async detectElements(
    screenshotBuffer: Buffer,
    options: VisionDetectionOptions
  ): Promise<VisionExecutionResult[]> {
    const startTime = Date.now();
    const artifactsDir = path.join(process.cwd(), 'artifacts', 'vision-debug');
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const png = PNG.sync.read(screenshotBuffer);
    const imgWidth = png.width;
    const imgHeight = png.height;
    
    const screenKey = options.screenHint || "default_screen"; 
    const elementKey = options.target || "unknown_element";

    // 1. FAST PATH: Check Cache
    const cacheEntry = this.cacheManager.get(screenKey, elementKey);

    if (cacheEntry && options.target) {
      const currentAspect = imgWidth / imgHeight;
      const cachedAspect = cacheEntry.viewport.width / cacheEntry.viewport.height;
      const ratioDiff = Math.abs(currentAspect - cachedAspect) / cachedAspect;
      
      const aspectChanged = ratioDiff > 0.1;

      if (aspectChanged) {
        console.log(`\n⚠️ [Gemini Vision] Viewport aspect ratio changed significantly (${cachedAspect.toFixed(2)} -> ${currentAspect.toFixed(2)}, diff: ${(ratioDiff*100).toFixed(1)}%). Skipping Fast Path to re-calibrate.`);
      } else {
        console.log(`\n⚡ [Gemini Vision] Cache HIT for "${elementKey}". Attempting Fast Path...`);
        
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
            const debugPath = path.join(artifactsDir, `gemini-${timestamp}-roi.png`);
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
              console.log(`\n✅ [Gemini Vision] Fast Path SUCCESS. Element verified in ROI.`);
              
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
              console.log(`\n⚠️ [Gemini Vision] Fast Path FAILED. Element not found in ROI. Falling back to full search.`);
              this.cacheManager.updateConfidence(screenKey, elementKey, false);
            }

          } catch (error) {
            console.error(`   Fast Path error: ${error}. Fallback to slow path.`);
          }
        }
      }
    }

    // 2. SLOW PATH: Full Search with Optimization
    console.log('\n🔍 [Gemini Vision] Starting full element detection (Slow Path)...');

    let processedBuffer = screenshotBuffer;
    try {
      processedBuffer = await this.processImage(screenshotBuffer, {
        resize: { width: 640 },
        grayscale: true
      });
      console.log(`   Image optimized: Resized (max 640) and grayscaled.`);
    } catch (e) {
      console.warn(`   Image optimization failed, using original. Error: ${e}`);
    }

    const screenshotPath = path.join(artifactsDir, `gemini-${timestamp}-optimized.png`);
    fs.writeFileSync(screenshotPath, processedBuffer);
    console.log(`   Debug image saved: ${screenshotPath}`);

    const optPng = PNG.sync.read(processedBuffer);
    const optWidth = optPng.width;
    const optHeight = optPng.height;

    try {
      const targetElement = options.target || 'unknown element';
      const userPrompt = options.prompt || `Find and locate: "${targetElement}"`;
      const apiPrompt = `Analyze the provided screenshot of a Korean web interface and detect all clickable buttons and interactive UI elements containing Korean text.

Task: ${userPrompt}

Instructions:
1. Identify all UI elements with Korean labels (e.g., "다음", "클릭하세요", "NEIS전송", "연장", "로그아웃").
2. For each element found, provide the bounding box coordinates in the specified format.
3. Coordinates must be in pixels relative to the image size (0,0 is top-left).
4. Translate the label to English only for the 'Text' field description if necessary, but keep the original Korean text in quotes.
5. If the specific target element is not found, return: NOT_FOUND

Target Element to find: "${targetElement}"

Format:
Text: "[Original Korean Text]" at (x, y, width, height) confidence: [0.0-1.0]

Response format examples:
Text: "다음" at (100, 50, 60, 30) confidence: 0.95
Text: "클릭하세요" at (180, 50, 80, 30) confidence: 0.92
Text: "복습하기" at (120, 200, 100, 40) confidence: 0.88

Your response:`;

      console.log(`\n📝 [Gemini Vision] Request Prompt:\n${'─'.repeat(60)}\n${apiPrompt}\n${'─'.repeat(60)}`);

      const visionText = await this.callVisionAPI(processedBuffer, apiPrompt);

      const responsePath = path.join(artifactsDir, `gemini-${timestamp}-response.txt`);
      fs.writeFileSync(responsePath, visionText);

      console.log(`\n📄 [Gemini Vision] Raw Response:\n${'─'.repeat(60)}\n${visionText}\n${'─'.repeat(60)}`);

      const parsedResults = this.parseVisionResults(visionText, optWidth, optHeight, options.target);
      
      console.log(`\n📊 [Gemini Vision] Parsed ${parsedResults.length} element(s)`);

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
        // Gemini returns coordinates in pixels relative to the original (pre-resized) image
        // No additional scaling needed since we already parsed pixel coordinates
        const globalBbox = {
          x: r.bbox.x,
          y: r.bbox.y,
          width: r.bbox.width,
          height: r.bbox.height
        };
        console.log(`   📐 Coordinate transform: parsed(${r.bbox.x.toFixed(0)}, ${r.bbox.y.toFixed(0)}) -> global(${globalBbox.x.toFixed(0)}, ${globalBbox.y.toFixed(0)}) [img: ${imgWidth}x${imgHeight}, opt: ${optWidth}x${optHeight}]`);

        if (target && r.text.toLowerCase().includes(target.toLowerCase())) {
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
            element_id: `gemini_${r.text.substring(0, 20).replace(/\s+/g, '_')}`
          },
          success: true,
          processing_time_ms: Date.now() - startTime,
          backend: this.type
        };
      });

      return finalResults;

    } catch (error) {
      console.error(`\n❌ [Gemini Vision] Error: ${error}`);
      return [{
        result: { bbox: { x: 0, y: 0, width: 0, height: 0 }, confidence: 0, label: '', element_id: '' },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processing_time_ms: Date.now() - startTime,
        backend: this.type
      }];
    }
  }

  private async callVisionAPI(imageBuffer: Buffer, promptText: string): Promise<string> {
    const base64Image = imageBuffer.toString('base64');

    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: 'image/png',
                data: base64Image
              }
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: this.maxTokens,
        temperature: this.temperature
      }
    };

    const modelUrl = this.getModelUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    // Log full request details
    const requestBodyForLog = {
      ...requestBody,
      contents: requestBody.contents.map(content => ({
        ...content,
        parts: content.parts.map(part => {
          if ('inlineData' in part) {
            return { ...part, inlineData: { ...part.inlineData, data: `[BASE64_IMAGE:${part.inlineData.data.length}chars]` } };
          }
          return part;
        })
      }))
    };
    console.log(`\n📤 [Gemini Vision] Full Request:\n${'─'.repeat(60)}`);
    console.log(`URL: ${modelUrl}`);
    console.log(`Body:\n${JSON.stringify(requestBodyForLog, null, 2)}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`[Gemini Vision] Image base64 size: ${base64Image.length} chars`);

    try {
      const response = await fetch(modelUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      console.log(`[Gemini Vision] API response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`Status ${response.status}: ${await response.text()}`);
      }

      const result = await response.json() as GeminiResponse;
      
      if (result.error) {
        throw new Error(`API Error: ${result.error.message}`);
      }

      if (!result.candidates || result.candidates.length === 0) {
        throw new Error('No candidates in response');
      }

      const candidate = result.candidates[0];
      if (!candidate || !candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('Invalid candidate content');
      }

      const textPart = candidate.content.parts.find(p => p.text);
      if (!textPart || !textPart.text) {
        throw new Error('No text content in response');
      }

      return textPart.text;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private parseVisionResults(visionText: string, imgWidth: number, imgHeight: number, _targetText?: string): ParsedVisionResult[] {
    const results: ParsedVisionResult[] = [];

    console.log(`\n🔍 [Gemini Vision] Parsing vision text (image: ${imgWidth}x${imgHeight}):`);
    console.log(`   Text length: ${visionText.length} chars`);
    console.log(`   First 200 chars: "${visionText.substring(0, 200).replace(/\n/g, '\\n')}"`);

    // Check for NOT_FOUND response
    if (visionText.trim().toUpperCase().includes('NOT_FOUND') || 
        visionText.trim().toLowerCase().includes('not found') ||
        visionText.trim().toLowerCase().includes('cannot find') ||
        visionText.trim().toLowerCase().includes('does not exist')) {
      console.log(`   ⚠️ Element not found in response`);
      return results;
    }

    // Try to parse as JSON first
    try {
      const jsonData = JSON.parse(visionText);
      console.log(`   ✅ Parsed as JSON`);
      const items = Array.isArray(jsonData) ? jsonData : [jsonData];
      
      items.forEach((item: any) => {
        if (item.bbox || item.x) {
             results.push({
                text: item.text || item.content || item.label || '',
                bbox: {
                  x: item.bbox?.[0] || item.x || 0,
                  y: item.bbox?.[1] || item.y || 0,
                  width: (item.bbox?.[2] || item.width || 0) - (item.bbox?.[0] || item.x || 0),
                  height: (item.bbox?.[3] || item.height || 0) - (item.bbox?.[1] || item.y || 0),
                },
                confidence: item.confidence || 0.8,
              });
        }
      });
      if (results.length > 0) {
        console.log(`   ✅ Found ${results.length} elements from JSON`);
        return results;
      }
    } catch (e) {
      console.log(`   ℹ️ Not valid JSON, parsing as text...`);
    }

    // Parse various coordinate formats
    const lines = visionText.split('\n');
    console.log(`   ℹ️ Split into ${lines.length} lines`);
    
    // Format: text followed by 4 numbers (x1, y1, x2, y2)
    const coordPattern = /^.*?"?([^"\d][^"]*?)"?\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)$/;
    
    // Standard format with bbox
    const standardPattern = /Text:\s*"?([^"]+)"?.*?(?:at|@)\s*\(?([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\)?.*?confidence[:,\s]+([\d.]+)/i;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const coordMatch = trimmedLine.match(coordPattern);
      if (coordMatch) {
        console.log(`   ✅ Matched coordPattern: "${trimmedLine.substring(0, 80)}"`);
        const [, textMatch, x1, y1, x2, y2] = coordMatch;
        if (textMatch && x1 && y1 && x2 && y2) {
          let cleanText = textMatch.trim();
          const promptArtifacts = [
            'Find element containing text:',
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

      const standardMatch = trimmedLine.match(standardPattern);
      if (standardMatch) {
        console.log(`   ✅ Matched standardPattern: "${trimmedLine.substring(0, 80)}"`);
        const [, textMatch, x, y, width, height, confidence] = standardMatch;
        if (textMatch && x && y && width && height && confidence) {
          let bboxX = parseFloat(x);
          let bboxY = parseFloat(y);
          let bboxW = parseFloat(width);
          let bboxH = parseFloat(height);

          if (bboxX <= 1 && bboxY <= 1 && bboxW <= 1 && bboxH <= 1) {
            bboxX *= imgWidth;
            bboxY *= imgHeight;
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

    console.log(`   ✅ Parsed ${results.length} elements from OCR text`);
    if (results.length > 0) {
      results.forEach((r, i) => {
        console.log(`     [${i}] "${r.text}" at (${r.bbox.x.toFixed(0)}, ${r.bbox.y.toFixed(0)}, ${(r.bbox.x + r.bbox.width).toFixed(0)}, ${(r.bbox.y + r.bbox.height).toFixed(0)}) confidence: ${r.confidence.toFixed(2)}`);
      });
    } else if (visionText.trim()) {
      console.log(`   ⚠️ No elements parsed. Raw text preview: "${visionText.substring(0, 100).replace(/\n/g, '\\n')}"`);
    }

    if (results.length === 0 && visionText.trim()) {
      console.log(`   📝 Using fallback: treating entire response as single element`);
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

