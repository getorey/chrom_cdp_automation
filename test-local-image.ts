import { OpenAIVisionBackend } from './src/runner/vision-openai-backend.js';
import fs from 'fs';
import path from 'path';

// 테스트할 로컬 이미지 파일 경로
const imagePath = 'D:\\docker\\NCSOFTVARCO-VISION-2.0-1.7B-OCR\\test_ocr.png';

async function testLocalImage() {
  console.log('========================================');
  console.log('Local Image OCR Test');
  console.log('========================================');
  console.log(`Image Path: ${imagePath}`);
  
  // 파일 존재 확인
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ Error: File not found - ${imagePath}`);
    process.exit(1);
  }
  
  console.log('✅ File exists');
  
  // 이미지 파일 읽기
  const imageBuffer = fs.readFileSync(imagePath);
  console.log(`✅ Image loaded (${imageBuffer.length} bytes)`);
  
  // OpenAI Vision Backend 초기화
  const backend = new OpenAIVisionBackend(
    'http://localhost:3000/v1',
    'NCSOFT/VARCO-VISION-2.0-1.7B-OCR'
  );
  
  console.log('\n🔄 Initializing backend...');
  await backend.initialize();
  console.log('✅ Backend initialized');
  
  // OCR 요청
  console.log('\n🔍 Running OCR on local image...\n');
  const results = await backend.detectElements(imageBuffer, {
    prompt: 'Extract all text from this image',
    target: undefined,
    threshold: 0.5,
    top_k: 10
  });
  
  // 결과 출력
  console.log('\n========================================');
  console.log('OCR RESULTS');
  console.log('========================================');
  
  if (results.length === 0) {
    console.log('❌ No results found');
  } else {
    results.forEach((result, index) => {
      console.log(`\n[Result ${index + 1}]`);
      console.log(`  Success: ${result.success}`);
      console.log(`  Text: ${result.result.label || '(empty)'}`);
      console.log(`  Confidence: ${result.result.confidence.toFixed(2)}`);
      console.log(`  Coordinates: (${Math.round(result.result.bbox.x)}, ${Math.round(result.result.bbox.y)})`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
    });
  }
  
  console.log('\n========================================');
  console.log('Test Complete');
  console.log('========================================');
}

testLocalImage().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
