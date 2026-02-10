#!/bin/bash

# VARCO-VISION API Test Script
# Usage: ./test-curl.sh [image_path]

IMAGE_PATH="${1:-D:\\docker\\NCSOFTVARCO-VISION-2.0-1.7B-OCR\\test_ocr.png}"

echo "========================================"
echo "VARCO-VISION API Curl Test"
echo "========================================"
echo "Image: $IMAGE_PATH"

# Check if image exists
if [ ! -f "$IMAGE_PATH" ]; then
    echo "❌ Error: Image file not found: $IMAGE_PATH"
    exit 1
fi

echo "✅ Image file found"

# Convert image to base64 (PowerShell for Windows compatibility)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows with Git Bash
    BASE64_IMAGE=$(powershell -Command "[Convert]::ToBase64String([System.IO.File]::ReadAllBytes('$IMAGE_PATH'))")
else
    # Linux/Mac
    BASE64_IMAGE=$(base64 -w 0 "$IMAGE_PATH")
fi

echo "✅ Image converted to base64 (${#BASE64_IMAGE} chars)"

# Create request JSON
REQUEST_BODY=$(cat <<EOF
{
  "model": "NCSOFT/VARCO-VISION-2.0-1.7B-OCR",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "<ocr>"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,$BASE64_IMAGE"
          }
        }
      ]
    }
  ],
  "max_tokens": 4096,
  "temperature": 0.1
}
EOF
)

echo ""
echo "📤 Sending request to http://localhost:3000/v1/chat/completions"
echo ""

# Save request for debugging
echo "$REQUEST_BODY" > request_debug.json
echo "📄 Request saved to: request_debug.json"

# Send request with curl
echo ""
echo "⏳ Waiting for response..."
echo ""

curl -X POST "http://localhost:3000/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY" \
  -w "\n\nHTTP Status: %{http_code}\nTotal Time: %{time_total}s\n" \
  -o response.json \
  --max-time 120 \
  -v 2>&1 | tee curl_log.txt

echo ""
echo "========================================"
echo "Response"
echo "========================================"

if [ -f response.json ]; then
    echo "📥 Response saved to: response.json"
    echo ""
    echo "📋 Response Body:"
    cat response.json | python -m json.tool 2>/dev/null || cat response.json
fi

echo ""
echo "📄 Curl log saved to: curl_log.txt"
echo "========================================"
