
import { OpenAI } from 'openai';
import fs from 'fs';

const client = new OpenAI({
  baseURL: 'http://127.0.0.1:3000/v1',
  apiKey: 'dummy',
});

async function testVision() {
  const imageBuffer = fs.readFileSync('artifacts/vision-debug/vision-2026-02-10T08-00-54-845Z.png');
  const base64Image = imageBuffer.toString('base64');
  
  console.log('Sending request to http://127.0.0.1:3000/v1/chat/completions...');
  const startTime = Date.now();
  
  try {
    const response = await client.chat.completions.create({
      model: "NCSOFT/VARCO-VISION-2.0-1.7B-OCR",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "<ocr>" },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1024,
      temperature: 0.1
    });
    console.log(`Success! Took ${(Date.now() - startTime) / 1000}s`);
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error('Error:', error);
  }
}

testVision();
