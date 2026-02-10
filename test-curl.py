#!/usr/bin/env python3
"""
VARCO-VISION API Curl Test Script
Usage: python test-curl.py [image_path]
"""

import base64
import json
import sys
import subprocess
import os

def main():
    # Get image path
    image_path = sys.argv[1] if len(sys.argv) > 1 else r"D:\docker\NCSOFTVARCO-VISION-2.0-1.7B-OCR\test_ocr.png"
    
    print("=" * 60)
    print("VARCO-VISION API Curl Test")
    print("=" * 60)
    print(f"Image: {image_path}")
    
    # Check if image exists
    if not os.path.exists(image_path):
        print(f"❌ Error: Image file not found: {image_path}")
        sys.exit(1)
    
    print("✅ Image file found")
    
    # Read and encode image
    with open(image_path, "rb") as f:
        image_data = f.read()
        base64_image = base64.b64encode(image_data).decode('utf-8')
    
    print(f"✅ Image converted to base64 ({len(base64_image)} chars)")
    
    # Create request body
    request_body = {
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
                            "url": f"data:image/png;base64,{base64_image}"
                        }
                    }
                ]
            }
        ],
        "max_tokens": 4096,
        "temperature": 0.1
    }
    
    # Save request for debugging
    with open("request_debug.json", "w", encoding="utf-8") as f:
        json.dump(request_body, f, indent=2, ensure_ascii=False)
    print(f"📄 Request saved to: request_debug.json")
    
    print("\n📤 Sending request to http://localhost:3000/v1/chat/completions")
    print("\n📋 Request Body (truncated):")
    request_str = json.dumps(request_body, indent=2, ensure_ascii=False)
    # Truncate base64 for display
    display_body = request_str[:500] + "... [truncated] ..." + request_str[-200:]
    print(display_body)
    
    print("\n" + "=" * 60)
    print("Executing curl command...")
    print("=" * 60)
    
    # Prepare curl command
    url = "http://localhost:3000/v1/chat/completions"
    headers = ["Content-Type: application/json"]
    
    # Build curl command
    curl_cmd = [
        "curl",
        "-X", "POST",
        url,
        "-H", "Content-Type: application/json",
        "-d", json.dumps(request_body),
        "-w", "\n\nHTTP Status: %{http_code}\nTotal Time: %{time_total}s\nSize Download: %{size_download}b\n",
        "-o", "response.json",
        "--max-time", "120",
        "-v"
    ]
    
    print(f"\nCommand: {' '.join(curl_cmd[:10])}... [truncated]")
    print("\n⏳ Waiting for response (max 120s)...")
    print("")
    
    # Execute curl
    try:
        result = subprocess.run(
            curl_cmd,
            capture_output=True,
            text=True,
            timeout=125
        )
        
        # Print stderr (verbose output)
        if result.stderr:
            print(result.stderr)
        
        # Print stdout
        if result.stdout:
            print(result.stdout)
            
    except subprocess.TimeoutExpired:
        print("❌ Request timed out after 120 seconds")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error executing curl: {e}")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("Response")
    print("=" * 60)
    
    # Read and display response
    if os.path.exists("response.json"):
        with open("response.json", "r", encoding="utf-8") as f:
            response_text = f.read()
        
        print(f"📥 Response saved to: response.json")
        print(f"📄 Response size: {len(response_text)} bytes")
        print("\n📋 Response Body:")
        
        try:
            response_json = json.loads(response_text)
            print(json.dumps(response_json, indent=2, ensure_ascii=False))
            
            # Extract OCR text if available
            if "choices" in response_json and len(response_json["choices"]) > 0:
                content = response_json["choices"][0].get("message", {}).get("content", "")
                if content:
                    print("\n" + "=" * 60)
                    print("OCR Text Extracted:")
                    print("=" * 60)
                    print(content)
                    
        except json.JSONDecodeError:
            print(response_text)
    else:
        print("❌ No response file created")
    
    print("\n" + "=" * 60)
    print("Test Complete")
    print("=" * 60)

if __name__ == "__main__":
    main()
