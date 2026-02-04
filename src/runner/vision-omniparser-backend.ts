import { VisionBackend, VisionBackendType, VisionDetectionOptions, VisionExecutionResult, VisionFallbackError, VisionFallbackErrorType } from './vision-fallback.js';

interface ParsedContentItem {
  type: string;
  bbox: number[];
  content: string | null;
  interactivity: boolean;
  source: string | null;
  confidence: number;
}

function parseOmniParserElements(input: string): ParsedContentItem[] {
  console.log(`   Parsing OmniParser output (length: ${input.length})`);
  
  const lines = input.split('\n').filter(line => line.trim());
  const elements: ParsedContentItem[] = [];
  
  for (const line of lines) {
    const match = line.match(/^icon\s+\d+:\s*(.+)$/);
    if (match && match[1]) {
      const dictStr = match[1];
      
      try {
        const jsonStr = dictStr
          .replace(/'/g, '"')
          .replace(/\bNone\b/g, 'null')
          .replace(/\bTrue\b/g, 'true')
          .replace(/\bFalse\b/g, 'false');
        
        const element = JSON.parse(jsonStr) as ParsedContentItem;
        elements.push(element);
      } catch (e) {
        console.log(`     ⚠️ Failed to parse line: ${line.substring(0, 50)}...`);
      }
    }
  }
  
  console.log(`   Parsed ${elements.length} elements from ${lines.length} lines`);
  return elements;
}

export class OmniParserBackend implements VisionBackend {
  readonly type = VisionBackendType.OmniParser;
  private initialized = false;
  private apiUrl: string;
  private confidenceThreshold = 0.3;

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl?.replace(/\/$/, '') ?? 'http://192.168.40.167:7861';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/`, { method: 'GET' });
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
        `OmniParser backend not available at ${this.apiUrl}. Please ensure that OmniParser Gradio server is running.`
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
        'OmniParser backend not initialized. Call initialize() first.'
      );
    }

    const base64Image = screenshotBuffer.toString('base64');
    const startTime = Date.now();

    console.log('\n🔍 [OmniParser] Starting element detection...');
    console.log(`   API URL: ${this.apiUrl}`);
    console.log(`   Options: ${JSON.stringify({
      target: _options.target,
      threshold: _options.threshold,
      ocr_language: _options.ocr_language
    })}`);

    try {
      const callUrl = `${this.apiUrl}/gradio_api/call/process`;
      
      const requestBody = {
        data: [
          { url: `data:image/png;base64,${base64Image}` },
          0.05,
          0.1,
          true,
          640
        ]
      };

      console.log(`\n📤 [OmniParser] Sending POST request to: ${callUrl}`);
      console.log(`   Request body (truncated): {"data": [{"url": "data:image/png;base64,${base64Image.substring(0, 50)}..."}, 0.05, 0.1, true, 640]}`);

      const callResponse = await fetch(callUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      console.log(`\n📥 [OmniParser] Initial response status: ${callResponse.status}`);

      if (!callResponse.ok) {
        const errorText = await callResponse.text();
        console.error(`   Error response: ${errorText}`);
        throw new VisionFallbackError(
          VisionFallbackErrorType.DetectionFailed,
          `OmniParser call failed with status ${callResponse.status}: ${errorText}`
        );
      }

      const { event_id } = await callResponse.json() as { event_id: string };
      console.log(`   Event ID: ${event_id}`);

      const resultUrl = `${callUrl}/${event_id}`;
      const maxAttempts = 30;
      
      console.log(`\n⏳ [OmniParser] Polling for results at: ${resultUrl}`);
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const resultResponse = await fetch(resultUrl);
        
        if (resultResponse.ok) {
          const resultText = await resultResponse.text();
          const lines = resultText.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === 'null') continue;
              
              try {
                const parsed = JSON.parse(data);
                
                if (Array.isArray(parsed) && parsed.length >= 2) {
                  const processingTimeMs = Date.now() - startTime;
                  const parsedElementsStr = parsed[1];
                  
                  console.log(`\n✅ [OmniParser] Result received after ${attempt + 1} attempts (${processingTimeMs}ms)`);
                  
                  let parsedContentList: ParsedContentItem[];
                  
                  if (typeof parsedElementsStr === 'string') {
                    console.log(`   Raw response (first 200 chars): ${parsedElementsStr.substring(0, 200)}`);
                    parsedContentList = parseOmniParserElements(parsedElementsStr);
                  } else {
                    parsedContentList = parsedElementsStr;
                  }
                  
                  if (parsedContentList.length === 0) {
                    console.log(`   ⚠️ No elements could be parsed`);
                    return [{
                      result: {
                        bbox: { x: 0, y: 0, width: 0, height: 0 },
                        confidence: 0,
                        label: '',
                        element_id: '',
                      },
                      success: false,
                      error: 'Failed to parse OmniParser elements',
                      processing_time_ms: processingTimeMs,
                      backend: this.type,
                    }];
                  }

                  console.log(`\n📊 [OmniParser] Raw elements count: ${parsedContentList.length}`);
                  console.log(`   All elements (${parsedContentList.length} total):`);
                  parsedContentList.forEach((elem, i) => {
                    const confidence = elem.confidence ?? 0;
                    const bboxStr = elem.bbox?.map((v: number) => v.toFixed(3)).join(', ') ?? 'N/A';
                    const content = elem.content ?? '[no text]';
                    const source = elem.source ?? '[no source]';
                    console.log(`   [${i}] type=${elem.type}, content="${content}", source="${source}", confidence=${confidence.toFixed(2)}, bbox=[${bboxStr}]`);
                  });

                  if (!Array.isArray(parsedContentList) || parsedContentList.length === 0) {
                    console.log(`   ⚠️ No elements detected`);
                    return [{
                      result: {
                        bbox: { x: 0, y: 0, width: 0, height: 0 },
                        confidence: 0,
                        label: '',
                        element_id: '',
                      },
                      success: false,
                      error: 'No elements detected by OmniParser',
                      processing_time_ms: processingTimeMs,
                      backend: this.type,
                    }];
                  }

                  let filteredElements = parsedContentList.filter((elem) => 
                    (elem.confidence ?? 0) >= this.confidenceThreshold
                  );

                  console.log(`\n🔍 [OmniParser] After confidence filter (>=${this.confidenceThreshold}): ${filteredElements.length} elements`);

                  if (_options.target) {
                    const targetText = _options.target.toLowerCase();
                    console.log(`   Filtering by target text: "${targetText}"`);
                    
                    filteredElements = filteredElements.filter((elem) => {
                      const content = (elem.content ?? '').toLowerCase();
                      const source = (elem.source ?? '').toLowerCase();
                      const matches = content.includes(targetText) || source.includes(targetText);
                      console.log(`     Checking: content="${elem.content}" -> ${matches ? '✅ MATCH' : '❌ no match'}`);
                      return matches;
                    });
                    
                    console.log(`   After text filter: ${filteredElements.length} elements`);
                  }

                  const visionResults = filteredElements.map((elem) => ({
                    result: {
                      bbox: {
                        x: (elem.bbox?.[0] ?? 0) * 1920,
                        y: (elem.bbox?.[1] ?? 0) * 1080,
                        width: ((elem.bbox?.[2] ?? 0) - (elem.bbox?.[0] ?? 0)) * 1920,
                        height: ((elem.bbox?.[3] ?? 0) - (elem.bbox?.[1] ?? 0)) * 1080,
                      },
                      confidence: elem.confidence ?? 0,
                      label: elem.type,
                      element_id: elem.source ?? '',
                    },
                    success: true,
                    processing_time_ms: processingTimeMs,
                    backend: this.type,
                  }));

                  if (visionResults.length === 0) {
                    console.log(`   ⚠️ No elements after all filtering`);
                    return [{
                      result: {
                        bbox: { x: 0, y: 0, width: 0, height: 0 },
                        confidence: 0,
                        label: '',
                        element_id: '',
                      },
                      success: false,
                      error: `No elements met confidence threshold of ${this.confidenceThreshold}` + (_options.target ? ` or matched target text "${_options.target}"` : ''),
                      processing_time_ms: processingTimeMs,
                      backend: this.type,
                    }];
                  }

                  console.log(`\n✅ [OmniParser] Final results: ${visionResults.length} element(s)`);
                  visionResults.forEach((vr, i) => {
                    console.log(`   [${i}] type=${vr.result.label}, confidence=${vr.result.confidence.toFixed(2)}, coords=(${Math.round(vr.result.bbox.x)}, ${Math.round(vr.result.bbox.y)})`);
                  });

                  return visionResults;
                }
              } catch (e) {
                console.error(`   ⚠️ Parse error: ${e}`);
                continue;
              }
            }
          }
        }
      }

      console.error(`\n❌ [OmniParser] Timeout after ${maxAttempts} attempts`);
      return [{
        result: {
          bbox: { x: 0, y: 0, width: 0, height: 0 },
          confidence: 0,
          label: '',
          element_id: '',
        },
        success: false,
        error: 'Timeout waiting for OmniParser result',
        processing_time_ms: Date.now() - startTime,
        backend: this.type,
      }];

    } catch (error) {
      console.error(`\n❌ [OmniParser] Error: ${error}`);
      return [{
        result: {
          bbox: { x: 0, y: 0, width: 0, height: 0 },
          confidence: 0,
          label: '',
          element_id: '',
        },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown OmniParser error',
        processing_time_ms: Date.now() - startTime,
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
