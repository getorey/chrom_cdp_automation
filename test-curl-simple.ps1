# Simple CURL Test for VARCO-VISION API
# Run this in PowerShell or Command Prompt

# Test 1: Check if server is running
curl -v http://localhost:3000/v1/models

# Test 2: Simple chat completion test (without image)
curl -X POST http://localhost:3000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{"model":"NCSOFT/VARCO-VISION-2.0-1.7B-OCR","messages":[{"role":"user","content":"Hello"}],"max_tokens":100}'

# Test 3: Test with a small base64 image
# First, create a simple test (you need to provide base64 image data)
# curl -X POST http://localhost:3000/v1/chat/completions `
#   -H "Content-Type: application/json" `
#   -d '{"model":"NCSOFT/VARCO-VISION-2.0-1.7B-OCR","messages":[{"role":"user","content":[{"type":"text","text":"<ocr>"},{"type":"image_url","image_url":{"url":"data:image/png;base64,YOUR_BASE64_IMAGE"}}]}],"max_tokens":4096}'
