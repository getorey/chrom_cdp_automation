import { PNG } from 'pngjs';
import * as fs from 'fs';
import * as path from 'path';

export interface TemplateMatchResult {
  x: number;
  y: number;
  confidence: number;
  width: number;
  height: number;
}

// Helper to decode PNG buffer to raw RGB pixels
function decodePng(buffer: Buffer): Promise<{ width: number; height: number; data: Buffer }> {
  return new Promise((resolve, reject) => {
    new PNG().parse(buffer, (error, data) => {
      if (error) {
        reject(error);
      } else {
        // pngjs data is RGBA (4 channels)
        // We want to return the raw buffer as is, but we'll handle the channels in the matching logic
        resolve({
          width: data.width,
          height: data.height,
          data: data.data 
        });
      }
    });
  });
}

export async function findTemplate(
  screenshotBuffer: Buffer,
  templateBuffer: Buffer,
  threshold: number = 0.8
): Promise<TemplateMatchResult | null> {
  try {
    // 1. Decode PNGs
    const screenshot = await decodePng(screenshotBuffer);
    const template = await decodePng(templateBuffer);
    
    // 2. Perform template matching using normalized cross-correlation
    // We pass 4 channels because pngjs output is RGBA
    const result = await performTemplateMatching(
      screenshot.data,
      template.data,
      screenshot.width,
      screenshot.height,
      template.width,
      template.height,
      threshold,
      4 // Channels
    );
    
    return result;
  } catch (error) {
    console.error('[TemplateMatcher] Error:', error);
    return null;
  }
}

async function performTemplateMatching(
  screenshotData: Buffer,
  templateData: Buffer,
  screenshotWidth: number,
  screenshotHeight: number,
  templateWidth: number,
  templateHeight: number,
  threshold: number,
  channels: number = 4
): Promise<TemplateMatchResult | null> {
  let maxCorrelation = -1;
  let bestX = 0;
  let bestY = 0;
  
  // Sliding window approach with normalized cross-correlation
  // Use step = 1 for maximum accuracy as step=5 was causing issues with small templates
  const step = 1; 
  
  console.log(`[TemplateMatcher] Searching for template (${templateWidth}x${templateHeight}) in screenshot (${screenshotWidth}x${screenshotHeight})... This may take a few seconds.`);

  for (let y = 0; y <= screenshotHeight - templateHeight; y += step) {
    for (let x = 0; x <= screenshotWidth - templateWidth; x += step) {
      const correlation = calculateNormalizedCrossCorrelation(
        screenshotData,
        templateData,
        x,
        y,
        screenshotWidth,
        templateWidth,
        templateHeight,
        channels
      );
      
      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestX = x;
        bestY = y;
      }
    }
  }
  
  if (maxCorrelation >= threshold) {
    // Refine position to center of template
    const centerX = bestX + templateWidth / 2;
    const centerY = bestY + templateHeight / 2;
    
    console.log(`[TemplateMatcher] Match found at (${centerX}, ${centerY}) with confidence ${maxCorrelation.toFixed(2)}`);
    
    return {
      x: centerX,
      y: centerY,
      confidence: maxCorrelation,
      width: templateWidth,
      height: templateHeight
    };
  }
  
  console.log(`[TemplateMatcher] No match found above threshold ${threshold} (best: ${maxCorrelation.toFixed(2)})`);
  return null;
}

function calculateNormalizedCrossCorrelation(
  screenshotData: Buffer,
  templateData: Buffer,
  startX: number,
  startY: number,
  screenshotWidth: number,
  templateWidth: number,
  templateHeight: number,
  channels: number
): number {
  let sumST = 0;
  let sumS = 0;
  let sumT = 0;
  let sumS2 = 0;
  let sumT2 = 0;
  let count = 0;
  
  const screenshotPixels = new Uint8Array(screenshotData);
  const templatePixels = new Uint8Array(templateData);
  
  for (let ty = 0; ty < templateHeight; ty++) {
    for (let tx = 0; tx < templateWidth; tx++) {
      const sx = startX + tx;
      const sy = startY + ty;
      
      const sIdx = (sy * screenshotWidth + sx) * channels;
      const tIdx = (ty * templateWidth + tx) * channels;
      
      // Use grayscale (average of RGB) - ignore Alpha (index + 3)
      const sVal1 = screenshotPixels[sIdx] ?? 0;
      const sVal2 = screenshotPixels[sIdx + 1] ?? 0;
      const sVal3 = screenshotPixels[sIdx + 2] ?? 0;
      const s = (sVal1 + sVal2 + sVal3) / 3;
      
      const tVal1 = templatePixels[tIdx] ?? 0;
      const tVal2 = templatePixels[tIdx + 1] ?? 0;
      const tVal3 = templatePixels[tIdx + 2] ?? 0;
      const t = (tVal1 + tVal2 + tVal3) / 3;
      
      sumST += s * t;
      sumS += s;
      sumT += t;
      sumS2 += s * s;
      sumT2 += t * t;
      count++;
    }
  }
  
  if (count === 0) return 0;
  
  const meanS = sumS / count;
  const meanT = sumT / count;
  
  const numerator = sumST - count * meanS * meanT;
  const denominatorS = Math.sqrt(sumS2 - count * meanS * meanS);
  const denominatorT = Math.sqrt(sumT2 - count * meanT * meanT);
  
  if (denominatorS === 0 || denominatorT === 0) return 0;
  
  return numerator / (denominatorS * denominatorT);
}

export async function loadTemplateImage(templatePath: string): Promise<Buffer | null> {
  try {
    // Try absolute path or relative to CWD
    let resolvedPath = templatePath;
    if (!fs.existsSync(resolvedPath)) {
         resolvedPath = path.join(process.cwd(), templatePath);
    }

    if (!fs.existsSync(resolvedPath)) {
      console.error(`[TemplateMatcher] Template not found: ${resolvedPath}`);
      return null;
    }

    const buffer = fs.readFileSync(resolvedPath);
    return buffer;
  } catch (error) {
    console.error(`[TemplateMatcher] Failed to load template: ${templatePath}`, error);
    return null;
  }
}

export function loadTemplateFromBase64(base64Data: string): Buffer | null {
  try {
    // Remove data URI prefix if present
    let cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    
    // Remove all non-base64 characters (newlines, spaces, headers)
    cleanBase64 = cleanBase64.replace(/[^A-Za-z0-9+/=]/g, '');
    
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    if (buffer.length === 0) {
      console.error('[TemplateMatcher] Base64 decoding resulted in empty buffer');
      return null;
    }
    
    console.log(`[TemplateMatcher] Loaded base64 template, buffer size: ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    console.error('[TemplateMatcher] Failed to decode base64 template:', error);
    return null;
  }
}
