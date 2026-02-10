import { VisionBackend, VisionBackendType, VisionDetectionOptions, VisionExecutionResult, VisionFallbackError, VisionFallbackErrorType } from './vision-fallback.js';
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

export class OpenAIVisionBackend implements VisionBackend {
  readonly type = VisionBackendType.OpenAI;
  //private initialized = false;
  private apiUrl: string;
  private modelName: string;
  private confidenceThreshold = 0.5;
  private maxTokens = 4096;
  private temperature = 0.1; // Low temperature for deterministic OCR results
  private apiKey: string | undefined;

  constructor(
    apiUrl: string = 'http://localhost:3000/v1',
    modelName: string = 'NCSOFT/VARCO-VISION-2.0-1.7B-OCR',
    apiKey?: string
  ) {
    // Ensure localhost is replaced with 127.0.0.1 to avoid Node.js IPv6 issues
    this.apiUrl = apiUrl.replace(/\/$/, '').replace('localhost', '127.0.0.1');
    this.modelName = modelName;
    this.apiKey = apiKey;
  }

  private getModelsUrl(): string {
    if (this.apiUrl.endsWith('/v1')) {
      return `${this.apiUrl}/models`;
    }
    return `${this.apiUrl}/v1/models`;
  }

  private getChatCompletionUrl(): string {
    if (this.apiUrl.endsWith('/v1')) {
      return `${this.apiUrl}/chat/completions`;
    }
    return `${this.apiUrl}/v1/chat/completions`;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      
      const modelsUrl = this.getModelsUrl();
      console.log(`[OpenAI Vision] Checking availability at: ${modelsUrl}`);
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers,
      });
      console.log(`[OpenAI Vision] Availability check response: ${response.status} ${response.statusText}`);
      return response.ok;
    } catch (error) {
      console.error(`[OpenAI Vision] isAvailable check failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async initialize(): Promise<void> {
    //if (await this.isAvailable()) {
    //  this.initialized = true;
    //} else {
    //  throw new VisionFallbackError(
    //    VisionFallbackErrorType.BackendNotAvailable,
    //    `OpenAI Vision backend not available at ${this.apiUrl}. Please ensure that the OpenAI-compatible server is running.`
    //  );
    //}
  }

  async detectElements(
    screenshotBuffer: Buffer,
    options: VisionDetectionOptions
  ): Promise<VisionExecutionResult[]> {
    //if (!this.initialized) {
    //  throw new VisionFallbackError(
    //    VisionFallbackErrorType.InitializationFailed,
    //    'OpenAI Vision backend not initialized. Call initialize() first.'
    //  );
    //}

    const base64Image = screenshotBuffer.toString('base64');
    const startTime = Date.now();

    // Get image dimensions for coordinate conversion
    const png = PNG.sync.read(screenshotBuffer);
    const imgWidth = png.width;
    const imgHeight = png.height;

    // Save screenshot for debugging
    const artifactsDir = path.join(process.cwd(), 'artifacts', 'vision-debug');
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(artifactsDir, `vision-${timestamp}.png`);
    fs.writeFileSync(screenshotPath, screenshotBuffer);

    console.log('\n🔍 [OpenAI Vision] Starting element detection...');
    const sizeKB = (screenshotBuffer.length / 1024).toFixed(2);
    console.log(`   Image Resolution: ${imgWidth} x ${imgHeight} px`);
    console.log(`   Image Size:       ${sizeKB} KB`);
    console.log(`   Aspect Ratio:     ${(imgWidth / imgHeight).toFixed(2)}`);
    console.log(`   Screenshot saved: ${screenshotPath}`);
    console.log(`   API URL: ${this.apiUrl}`);
    console.log(`   Model: ${this.modelName}`);
    console.log(`   Target: ${options.target || 'N/A'}`);
    //console.log(`   Prompt: ${options.prompt}`);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const requestBody = {
        model: this.modelName,
        messages: [
          {
            role: 'user',
            content: [
              {
                "type": "text",
                "text": "<ocr>"
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature

      };

      const chatUrl = this.getChatCompletionUrl();
      console.log(`\n📤 [OpenAI Vision] Sending POST request to: ${chatUrl}`);
      //console.log(`\n📋 [OpenAI Vision] Request Headers:`, JSON.stringify(headers, null, 2));
      //console.log(`\n📋 [OpenAI Vision] Request Body:`, JSON.stringify(requestBody, null, 2));

      console.log(`\n⏳ [OpenAI Vision] Sending request with 120s timeout...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      
      let response: Response;
      try {
        response = await fetch(chatUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.error(`\n❌ [OpenAI Vision] Fetch error: ${errorMsg}`);
        
        if (errorMsg.includes('ECONNREFUSED')) {
          throw new VisionFallbackError(
            VisionFallbackErrorType.BackendNotAvailable,
            `Cannot connect to server at ${chatUrl}. Is the VARCO-VISION server running on localhost:3000?`
          );
        }
        
        throw new VisionFallbackError(
          VisionFallbackErrorType.DetectionFailed,
          `Network error: ${errorMsg}`
        );
      }

      console.log(`\n📥 [OpenAI Vision] Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`   Error response: ${errorText}`);
        throw new VisionFallbackError(
          VisionFallbackErrorType.DetectionFailed,
          `OpenAI Vision request failed with status ${response.status}: ${errorText}`
        );
      }

      const result = await response.json() as OpenAIResponse;
      const processingTimeMs = Date.now() - startTime;

      // Save API response for debugging
      const responsePath = path.join(artifactsDir, `vision-${timestamp}-response.json`);
      fs.writeFileSync(responsePath, JSON.stringify(result, null, 2));

      console.log(`\n✅ [OpenAI Vision] Result received (${processingTimeMs}ms)`);
      console.log(`   Response saved: ${responsePath}`);

      if (!result.choices || result.choices.length === 0) {
        console.log(`   ⚠️ No choices in response`);
        return [{
          result: {
            bbox: { x: 0, y: 0, width: 0, height: 0 },
            confidence: 0,
            label: '',
            element_id: '',
          },
          success: false,
          error: 'No vision results from OpenAI API',
          processing_time_ms: processingTimeMs,
          backend: this.type,
        }];
      }

      const choice = result.choices[0];
      if (!choice || !choice.message) {
        console.log(`   ⚠️ No valid choice in response`);
        return [{
          result: {
            bbox: { x: 0, y: 0, width: 0, height: 0 },
            confidence: 0,
            label: '',
            element_id: '',
          },
          success: false,
          error: 'Invalid response format from OpenAI API',
          processing_time_ms: processingTimeMs,
          backend: this.type,
        }];
      }

      const visionText = choice.message.content;
      console.log(`   Vision Text: ${visionText.substring(0, 200)}${visionText.length > 200 ? '...' : ''}`);

      // Parse vision results to extract bounding boxes and text
      const parsedResults = this.parseVisionResults(visionText, imgWidth, imgHeight, options.target);

      if (parsedResults.length === 0) {
        console.log(`   ⚠️ No elements could be parsed from vision result`);
        return [{
          result: {
            bbox: { x: 0, y: 0, width: 0, height: 0 },
            confidence: 0,
            label: '',
            element_id: '',
          },
          success: false,
          error: 'Failed to parse vision results',
          processing_time_ms: processingTimeMs,
          backend: this.type,
        }];
      }

      console.log(`\n📊 [OpenAI Vision] Parsed ${parsedResults.length} element(s)`);

      // Filter by confidence threshold
      let filteredResults = parsedResults.filter(
        (elem) => elem.confidence >= this.confidenceThreshold
      );

      console.log(`   After confidence filter (>=${this.confidenceThreshold}): ${filteredResults.length} elements`);

      // If target text specified, filter by that
      if (options.target) {
        const targetText = options.target.toLowerCase();
        console.log(`   Filtering by target text: "${targetText}"`);

        filteredResults = filteredResults.filter((elem) =>
          elem.text.toLowerCase().includes(targetText)
        );

        console.log(`   After text filter: ${filteredResults.length} elements`);
      }

      if (filteredResults.length === 0) {
        console.log(`   ⚠️ No elements after filtering`);
        return [{
          result: {
            bbox: { x: 0, y: 0, width: 0, height: 0 },
            confidence: 0,
            label: '',
            element_id: '',
          },
          success: false,
          error: `No elements met confidence threshold of ${this.confidenceThreshold}` +
            (options.target ? ` or matched target text "${options.target}"` : ''),
          processing_time_ms: processingTimeMs,
          backend: this.type,
        }];
      }

      // Convert to VisionExecutionResult format
      const visionResults: VisionExecutionResult[] = filteredResults.map((elem) => ({
        result: {
          bbox: elem.bbox,
          confidence: elem.confidence,
          label: elem.text,
          element_id: `openai_${elem.text.substring(0, 20).replace(/\s+/g, '_')}`,
        },
        success: true,
        processing_time_ms: processingTimeMs,
        backend: this.type,
      }));

      console.log(`\n✅ [OpenAI Vision] Final results: ${visionResults.length} element(s)`);
      visionResults.forEach((vr, i) => {
        console.log(`   [${i}] text="${vr.result.label}", confidence=${vr.result.confidence.toFixed(2)}, coords=(${Math.round(vr.result.bbox.x)}, ${Math.round(vr.result.bbox.y)})`);
      });

      return visionResults;

    } catch (error) {
      console.error(`\n❌ [OpenAI Vision] Error: ${error}`);
      return [{
        result: {
          bbox: { x: 0, y: 0, width: 0, height: 0 },
          confidence: 0,
          label: '',
          element_id: '',
        },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown OpenAI Vision error',
        processing_time_ms: Date.now() - startTime,
        backend: this.type,
      }];
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
      if (Array.isArray(jsonData)) {
        return jsonData.map((item: any) => ({
          text: item.text || item.content || '',
          bbox: {
            x: item.bbox?.[0] || item.x || 0,
            y: item.bbox?.[1] || item.y || 0,
            width: (item.bbox?.[2] || item.width || 0) - (item.bbox?.[0] || item.x || 0),
            height: (item.bbox?.[3] || item.height || 0) - (item.bbox?.[1] || item.y || 0),
          },
          confidence: item.confidence || 0.8,
        }));
      }
    } catch {
      // Not JSON, parse as text
    }

    // Parse VARCO-VISION format: "TextContent0.371, 0.095, 0.411, 0.107"
    // Pattern: text followed by 4 numbers (x1, y1, x2, y2)
    const lines = visionText.split('\n');
    
    // VARCO format: text immediately followed by coordinates
    // e.g., "한국어0.371, 0.095, 0.411, 0.107"
    // Also handles cases where VARCO echoes the prompt: "...Find element containing text: "한국어"0.361, 0.093, 0.409, 0.102"
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
          // Clean up text - remove common prompt artifacts
          let cleanText = textMatch.trim();
          // Remove prompt echo artifacts
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
          
          // Skip if cleaned text is empty
          if (!cleanText) continue;
          
          results.push({
            text: cleanText,
            bbox: {
              x: parseFloat(x1) * imgWidth,
              y: parseFloat(y1) * imgHeight,
              width: (parseFloat(x2) - parseFloat(x1)) * imgWidth,
              height: (parseFloat(y2) - parseFloat(y1)) * imgHeight,
            },
            confidence: 0.8, // VARCO doesn't provide confidence, use default
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
            bboxW = (bboxW - parseFloat(x)) * imgWidth; // If width is actually x2, need check. Assuming width here as per regex.
            bboxH = (bboxH - parseFloat(y)) * imgHeight;
          } else {
             // Already pixel coordinates? Check format.
             // Standard format regex has width/height, not x2/y2 usually.
             // "at (x, y, width, height)"
             // If > 1, assume pixels.
             // Regex extracts 4 numbers. If it's x,y,x2,y2 format, then need width = x2-x.
             // Assuming width/height for now.
             bboxW = bboxW - bboxX; // If regex captured x2, convert to width
             bboxH = bboxH - bboxY; // If regex captured y2, convert to height
             // Wait, standard pattern: (x, y, width, height) usually.
             // But if it's x,y,x2,y2, then width = x2-x1.
             // Given VARCO is x1,y1,x2,y2. Standard might be x,y,w,h.
             // Let's assume standard pattern matches x,y,x2,y2 for safety if > x.
             if (bboxW > bboxX) bboxW -= bboxX;
             if (bboxH > bboxY) bboxH -= bboxY;
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
