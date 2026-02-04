import sharp from 'sharp';
import { getTemplatesPath } from '../config/index.js';

export interface TemplateMatchResult {
  x: number;
  y: number;
  confidence: number;
  width: number;
  height: number;
}

export async function findTemplate(
  screenshotBuffer: Buffer,
  templateBuffer: Buffer,
  threshold: number = 0.8
): Promise<TemplateMatchResult | null> {
  try {
    // Load images using sharp for preprocessing
    const screenshot = sharp(screenshotBuffer);
    const template = sharp(templateBuffer);
    
    // Get metadata
    const screenshotMeta = await screenshot.metadata();
    const templateMeta = await template.metadata();
    
    if (!screenshotMeta.width || !screenshotMeta.height || !templateMeta.width || !templateMeta.height) {
      console.error('[TemplateMatcher] Failed to get image metadata');
      return null;
    }
    
    // Convert to raw pixel data
    const screenshotRaw = await screenshot
      .resize(screenshotMeta.width, screenshotMeta.height)
      .raw()
      .toBuffer();
    const templateRaw = await template
      .resize(templateMeta.width, templateMeta.height)
      .raw()
      .toBuffer();
    
    // Perform template matching using normalized cross-correlation
    const result = await performTemplateMatching(
      screenshotRaw,
      templateRaw,
      screenshotMeta.width,
      screenshotMeta.height,
      templateMeta.width,
      templateMeta.height,
      threshold
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
  threshold: number
): Promise<TemplateMatchResult | null> {
  let maxCorrelation = -1;
  let bestX = 0;
  let bestY = 0;
  
  // Sliding window approach with normalized cross-correlation
  const step = 2; // Skip pixels for performance
  
  for (let y = 0; y <= screenshotHeight - templateHeight; y += step) {
    for (let x = 0; x <= screenshotWidth - templateWidth; x += step) {
      const correlation = calculateNormalizedCrossCorrelation(
        screenshotData,
        templateData,
        x,
        y,
        screenshotWidth,
        templateWidth,
        templateHeight
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
  templateHeight: number
): number {
  let sumST = 0;
  let sumS = 0;
  let sumT = 0;
  let sumS2 = 0;
  let sumT2 = 0;
  let count = 0;
  
  const screenshotPixels = new Uint8Array(screenshotData);
  const templatePixels = new Uint8Array(templateData);
  const channels = 3; // RGB
  
  for (let ty = 0; ty < templateHeight; ty++) {
    for (let tx = 0; tx < templateWidth; tx++) {
      const sx = startX + tx;
      const sy = startY + ty;
      
      const sIdx = (sy * screenshotWidth + sx) * channels;
      const tIdx = (ty * templateWidth + tx) * channels;
      
      // Use grayscale (average of RGB) - with bounds checking
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
    const fs = await import('fs');
    const { join } = await import('path');
    
    const resolvedPath = templatePath.startsWith('/') || templatePath.includes(':\\')
      ? templatePath
      : join(getTemplatesPath(), templatePath);
    
    if (!fs.existsSync(resolvedPath)) {
      console.error(`[TemplateMatcher] Template not found: ${resolvedPath}`);
      return null;
    }
    
    const buffer = await sharp(resolvedPath)
      .resize(100, 100, { fit: 'inside' })
      .toBuffer();
    
    return buffer;
  } catch (error) {
    console.error(`[TemplateMatcher] Failed to load template: ${templatePath}`, error);
    return null;
  }
}

export function loadTemplateFromBase64(base64Data: string): Buffer | null {
  try {
    const base64String = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64String, 'base64');
    
    if (buffer.length === 0) {
      console.error('[TemplateMatcher] Base64 decoding resulted in empty buffer');
      return null;
    }
    
    return buffer;
  } catch (error) {
    console.error('[TemplateMatcher] Failed to decode base64 template:', error);
    return null;
  }
}
