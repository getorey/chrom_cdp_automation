#!/usr/bin/env python3
"""
VARCO-VISION API Test using requests library
Usage: python test-requests.py [image_path]
"""

import base64
import json
import sys
import os
import time

def main():
    try:
        import requests
    except ImportError:
        print("❌ Error: 'requests' library not installed")
        print("Install with: pip install requests")
        sys.exit(1)
    
    # Get image path
    image_path = sys.argv[1] if len(sys.argv) > 1 else r"D:\docker\NCSOFTVARCO-VISION-2.0-1.7B-OCR\test_ocr.png"
    
    print("=" * 60)
    print("VARCO-VISION API Test (using requests)")
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
    
    # Prepare request
    url = "http://localhost:3000/v1/chat/completions"
    headers = {
        "Content-Type": "application/json"
    }
    
    print("\n" + "=" * 60)
    print("Request Details")
    print("=" * 60)
    print(f"URL: {url}")
    print(f"Method: POST")
    print(f"Headers: {json.dumps(headers, indent=2)}")
    print(f"\nBody size: {len(json.dumps(request_body))} bytes")
    print(f"Image data size: {len(base64_image)} bytes")
    
    print("\n" + "=" * 60)
    print("Sending Request...")
    print("=" * 60)
    
    # Send request
    try:
        start_time = time.time()
        response = requests.post(
            url,
            headers=headers,
            json=request_body,
            timeout=120
        )
        elapsed_time = time.time() - start_time
        
        print(f"✅ Response received in {elapsed_time:.2f}s")
        print(f"\n📊 Status Code: {response.status_code}")
        print(f"📊 Response Headers:")
        for key, value in response.headers.items():
            print(f"  {key}: {value}")
        
        print("\n" + "=" * 60)
        print("Response Body")
        print("=" * 60)
        
        try:
            response_json = response.json()
            print(json.dumps(response_json, indent=2, ensure_ascii=False))
            
            # Save response
            with open("response.json", "w", encoding="utf-8") as f:
                json.dump(response_json, f, indent=2, ensure_ascii=False)
            print(f"\n📄 Response saved to: response.json")
            
            # Extract OCR text
            if "choices" in response_json and len(response_json["choices"]) > 0:
                content = response_json["choices"][0].get("message", {}).get("content", "")
                if content:
                    print("\n" + "=" * 60)
                    print("📝 OCR Text Extracted:")
                    print("=" * 60)
                    print(content)
                    
        except json.JSONDecodeError:
            print(response.text)
            with open("response.txt", "w", encoding="utf-8") as f:
                f.write(response.text)
    
    except requests.exceptions.Timeout:
        print("❌ Request timed out after 120 seconds")
        print("\n💡 Possible causes:")
        print("  1. VARCO-VISION server is not running on localhost:3000")
        print("  2. Server is processing but taking too long")
        print("  3. Server is overloaded")
        sys.exit(1)
    
    except requests.exceptions.ConnectionError as e:
        print(f"❌ Connection error: {e}")
        print("\n💡 Possible causes:")
        print("  1. VARCO-VISION server is not running")
        print("  2. Wrong port (should be 3000)")
        print("  3. Firewall blocking connection")
        sys.exit(1)
    
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("✅ Test Complete")
    print("=" * 60)

if __name__ == "__main__":
    main()
